import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { AwsDsqlRetryExhaustedError } from "@aws/aurora-dsql-drizzle";
import { createDsqlDb, type VeterinaryDb } from "../src/dsql-client";
import { owner, pet, specialty, specialtyToVet, vet } from "../src/schema";
import { VeterinaryService } from "../src/veterinary-service";

jest.setTimeout(60000);

/**
 * Pull the DSQL SQLSTATE out of an error. Drizzle wraps driver errors, so the
 * code lives on `cause` (sometimes nested) rather than the top-level error.
 */
function dsqlErrorCode(error: unknown): string {
  let current: unknown = error;
  while (current != null && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return "<none>";
}

describe("DSQL Drizzle client", () => {
  let db: VeterinaryDb;

  beforeAll(() => {
    db = createDsqlDb();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  test("basic query works", async () => {
    const result = await db.execute(sql`SELECT 1 as test`);
    expect(result.rows).toEqual([{ test: 1 }]);
  });

  test("CRUD operations work", async () => {
    const [created] = await db
      .insert(owner)
      .values({ name: "Test Owner", city: "Seattle", telephone: "555-0100" })
      .returning();
    expect(created!.id).toBeDefined();
    expect(created!.name).toBe("Test Owner");

    const found = await db.query.owner.findFirst({
      where: eq(owner.id, created!.id),
    });
    expect(found?.city).toBe("Seattle");

    await db
      .update(owner)
      .set({ city: "Portland" })
      .where(eq(owner.id, created!.id));
    const updated = await db.query.owner.findFirst({
      where: eq(owner.id, created!.id),
    });
    expect(updated?.city).toBe("Portland");

    await db.delete(owner).where(eq(owner.id, created!.id));
    const deleted = await db.query.owner.findFirst({
      where: eq(owner.id, created!.id),
    });
    expect(deleted).toBeUndefined();
  });

  test("relations work at the ORM level", async () => {
    const [createdOwner] = await db
      .insert(owner)
      .values({ name: "Pet Owner", city: "Boston" })
      .returning();
    const [createdPet] = await db
      .insert(pet)
      .values({
        name: "Buddy",
        birthDate: new Date("2020-01-15"),
        ownerId: createdOwner!.id,
      })
      .returning();

    const ownerWithPets = await db.query.owner.findFirst({
      where: eq(owner.id, createdOwner!.id),
      with: { pets: true },
    });
    expect(ownerWithPets?.pets).toHaveLength(1);
    expect(ownerWithPets?.pets[0]?.name).toBe("Buddy");

    await db.delete(pet).where(eq(pet.id, createdPet!.id));
    await db.delete(owner).where(eq(owner.id, createdOwner!.id));
  });

  test("native foreign keys reject orphan rows", async () => {
    let thrown: unknown;
    try {
      await db.insert(pet).values({
        name: "Orphan",
        birthDate: new Date("2020-01-15"),
        ownerId: "00000000-0000-4000-8000-000000000000",
      });
    } catch (error) {
      thrown = error;
    }

    expect(dsqlErrorCode(thrown)).toBe("23503");
  });

  test("UUID generation works", async () => {
    const [created] = await db
      .insert(owner)
      .values({ name: "UUID Test", city: "Denver" })
      .returning();

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(created!.id).toMatch(uuidRegex);

    await db.delete(owner).where(eq(owner.id, created!.id));
  });

  test("db.transactionWithRetry commits and exposes the relational query API", async () => {
    const created = await db.transactionWithRetry(async (tx) => {
      const [row] = await tx
        .insert(owner)
        .values({ name: "Retry Owner", city: "Austin" })
        .returning();
      // The schema is re-threaded into the tx, so tx.query.<table> works here.
      const found = await tx.query.owner.findFirst({
        where: eq(owner.id, row!.id),
      });
      expect(found?.city).toBe("Austin");
      return row!;
    });

    // The transaction committed: the row is visible outside it.
    const persisted = await db.query.owner.findFirst({
      where: eq(owner.id, created.id),
    });
    expect(persisted?.name).toBe("Retry Owner");

    await db.delete(owner).where(eq(owner.id, created.id));
  });

  test("nested tx.transaction() throws a clear client-side error", async () => {
    await expect(
      db.transaction(async (tx) => {
        // Failing fast on the client beats a cryptic server-side error.
        await tx.transaction(async () => "unreachable");
      }),
    ).rejects.toThrow(/keeps transactions flat/);
  });

  test("transactionWithRetry retries a forced OCC conflict and re-reads fresh data", async () => {
    // Deterministic counterpart to the concurrency test below: instead of
    // hoping contention arises, the conflict is forced. The transaction reads
    // the row, then a competing write commits on a different pooled
    // connection, so this transaction's COMMIT loses with 40001 and the
    // callback must re-run.
    const [row] = await db
      .insert(owner)
      .values({ name: "OCC Forced", city: "Seattle", telephone: "0" })
      .returning();
    const id = row!.id;

    let attempts = 0;
    const retries: Array<{ attempt: number; code: string }> = [];

    await db.transactionWithRetry(
      async (tx) => {
        attempts++;
        const current = await tx.query.owner.findFirst({
          where: eq(owner.id, id),
        });
        const value = Number(current!.telephone ?? "0");

        if (attempts === 1) {
          // `db` (not `tx`) autocommits on its own connection.
          await db
            .update(owner)
            .set({ telephone: "100" })
            .where(eq(owner.id, id));
        }

        await tx
          .update(owner)
          .set({ telephone: String(value + 1) })
          .where(eq(owner.id, id));
      },
      undefined,
      {
        maxRetries: 5,
        onRetry: (error, attempt) =>
          retries.push({ attempt, code: dsqlErrorCode(error) }),
      },
    );

    // The retry actually happened, and it was an OCC conflict that caused it.
    expect(attempts).toBeGreaterThan(1);
    expect(retries.length).toBeGreaterThan(0);
    expect(retries[0]?.code).toBe("40001");

    // 101, not 1: the re-run read the competing write's committed value (100)
    // rather than the stale value it saw on the first attempt.
    const final = await db.query.owner.findFirst({ where: eq(owner.id, id) });
    expect(final!.telephone).toBe("101");

    await db.delete(owner).where(eq(owner.id, id));
  });

  test("transactionWithRetry surfaces AwsDsqlRetryExhaustedError when retries run out", async () => {
    const [row] = await db
      .insert(owner)
      .values({ name: "OCC Exhausted", city: "Seattle", telephone: "0" })
      .returning();
    const id = row!.id;

    let attempts = 0;
    // maxRetries: 0 means one attempt only, so the forced conflict cannot be
    // recovered from and must surface as the adapter's own error type.
    await expect(
      db.transactionWithRetry(
        async (tx) => {
          attempts++;
          await tx.query.owner.findFirst({ where: eq(owner.id, id) });
          await db
            .update(owner)
            .set({ telephone: "100" })
            .where(eq(owner.id, id));
          await tx
            .update(owner)
            .set({ telephone: "1" })
            .where(eq(owner.id, id));
        },
        undefined,
        { maxRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(AwsDsqlRetryExhaustedError);

    expect(attempts).toBe(1);

    await db.delete(owner).where(eq(owner.id, id));
  });

  test("plain transaction() does not retry — the 40001 propagates", async () => {
    const [row] = await db
      .insert(owner)
      .values({ name: "OCC No Retry", city: "Seattle", telephone: "0" })
      .returning();
    const id = row!.id;

    let attempts = 0;
    let thrown: unknown;
    try {
      await db.transaction(async (tx) => {
        attempts++;
        await tx.query.owner.findFirst({ where: eq(owner.id, id) });
        await db
          .update(owner)
          .set({ telephone: "100" })
          .where(eq(owner.id, id));
        await tx.update(owner).set({ telephone: "1" }).where(eq(owner.id, id));
      });
    } catch (e) {
      thrown = e;
    }

    // Opting out of retry must stay opt-out: one attempt, raw conflict.
    expect(attempts).toBe(1);
    expect(dsqlErrorCode(thrown)).toBe("40001");

    await db.delete(owner).where(eq(owner.id, id));
  });

  test("concurrent transactionWithRetry contending on one row all commit", async () => {
    // Complements the forced-conflict test above: that one proves a retry
    // happens, this one proves no increment is lost when many transactions
    // race on the same row. Contention here is incidental rather than forced,
    // so this test asserts the outcome (every increment survives) instead of
    // the retry count.
    const [counter] = await db
      .insert(owner)
      .values({ name: "OCC Counter", city: "Seattle", telephone: "0" })
      .returning();
    const id = counter!.id;
    const N = 8;

    await Promise.all(
      Array.from({ length: N }, () =>
        db.transactionWithRetry(
          async (tx) => {
            const row = await tx.query.owner.findFirst({
              where: eq(owner.id, id),
            });
            const next = String(Number(row!.telephone ?? "0") + 1);
            await tx
              .update(owner)
              .set({ telephone: next })
              .where(eq(owner.id, id));
          },
          undefined,
          // A little headroom over the default so the test is robust to
          // network jitter without being flaky.
          { maxRetries: 10 },
        ),
      ),
    );

    const final = await db.query.owner.findFirst({ where: eq(owner.id, id) });
    expect(Number(final!.telephone)).toBe(N);

    await db.delete(owner).where(eq(owner.id, id));
  });

  test("CREATE INDEX ASYNC pet_owner_id_idx exists after migration", async () => {
    // The migrator issues CREATE INDEX ASYNC then blocks on
    // sys.wait_for_job(job_id) before recording the statement, so by the time
    // db:migrate returns the async index must actually exist in the catalog.
    // (sys.jobs is not queried here: DSQL prunes completed jobs, so the
    // deterministic wait-ordering proof lives in the mocked migrator test.)
    const result = await db.execute(sql`
      SELECT indexname FROM pg_indexes WHERE indexname = 'pet_owner_id_idx'
    `);
    expect(result.rows[0]?.["indexname"]).toBe("pet_owner_id_idx");
  });

  describe("VeterinaryService referential checks", () => {
    let service: VeterinaryService;

    beforeAll(() => {
      service = new VeterinaryService(db);
    });

    test("createPet rejects an unknown owner and writes no pet", async () => {
      const missingOwnerId = "00000000-0000-4000-8000-000000000000";

      await expect(
        service.createPet("Orphan", new Date("2020-01-01"), missingOwnerId),
      ).rejects.toThrow(`no owner ${missingOwnerId}`);

      const found = await db.query.pet.findFirst({
        where: eq(pet.name, "Orphan"),
      });
      expect(found).toBeUndefined();
    });

    test("createVet rejects an unknown specialty and writes no vet", async () => {
      // specialty.name is the primary key, so a leaked row would fail every
      // later run on a duplicate key; unique name plus finally-scoped cleanup.
      const name = `Unknown Specialty ${randomUUID()}`;
      const [known] = await db.insert(specialty).values({ name }).returning();

      try {
        await expect(
          service.createVet("Unknown Vet", [known!.name, "Nonexistent"]),
        ).rejects.toThrow(/unknown specialties Nonexistent/);

        const orphan = await db.query.vet.findFirst({
          where: eq(vet.name, "Unknown Vet"),
        });
        expect(orphan).toBeUndefined();
      } finally {
        await db.delete(specialty).where(eq(specialty.name, known!.name));
      }
    });

    // The check above throws before any write, so it proves validation, not
    // rollback. Repeating a name passes validation and then violates the join
    // table's composite key *after* the vet row is inserted, so only the
    // transaction can keep the vet from surviving.
    test("createVet rolls back the vet when the join insert fails", async () => {
      const name = `Duplicate Specialty ${randomUUID()}`;
      const [known] = await db.insert(specialty).values({ name }).returning();

      try {
        let thrown: unknown;
        try {
          await service.createVet("Duplicate Vet", [known!.name, known!.name]);
        } catch (error) {
          thrown = error;
        }
        // A unique violation, not a validation error: asserting the code pins
        // the failure to the join insert, so the rollback is what removes the
        // vet rather than the vet never having been written.
        expect(dsqlErrorCode(thrown)).toBe("23505");

        const orphan = await db.query.vet.findFirst({
          where: eq(vet.name, "Duplicate Vet"),
        });
        expect(orphan).toBeUndefined();
        const joins = await db.query.specialtyToVet.findMany({
          where: eq(specialtyToVet.specialtyName, known!.name),
        });
        expect(joins).toHaveLength(0);
      } finally {
        await db.delete(specialty).where(eq(specialty.name, known!.name));
      }
    });
  });

  // Referenced so the import stays exercised for consumers reading this test
  // as an example — trips the compiler if the export moves or is renamed.
  test("AwsDsqlRetryExhaustedError is importable from the package", () => {
    expect(typeof AwsDsqlRetryExhaustedError).toBe("function");
  });
});
