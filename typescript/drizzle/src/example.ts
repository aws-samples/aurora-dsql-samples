import assert from "node:assert";
import { eq, asc } from "drizzle-orm";
import { owner, pet, specialty, vet, specialtyToVet } from "./schema";
import { DsqlDatabase } from "./dsql-client";

const PET_1_BIRTH_DATE = new Date("2006-10-25");
const PET_2_BIRTH_DATE = new Date("2021-07-23");

export async function runVeterinaryExample(db: DsqlDatabase) {
    const ids = await populateDb(db);
    await verifyPets(db);
    await verifyOwners(db);
    await verifyVets(db);
    await cleanup(db, ids);
}

async function populateDb(db: DsqlDatabase) {
    console.log("Creating owners...");
    const [john] = await db
        .insert(owner)
        .values({ name: "John Doe", city: "New York" })
        .returning();
    const [mary] = await db
        .insert(owner)
        .values({
            name: "Mary Major",
            city: "Anytown",
            telephone: "555-555-0123",
        })
        .returning();
    console.log(`Created owner: ${john!.name} (ID: ${john!.id})`);
    console.log(`Created owner: ${mary!.name} (ID: ${mary!.id})`);

    console.log("Creating pets...");
    const [pet1] = await db
        .insert(pet)
        .values({
            name: "Pet1",
            birthDate: PET_1_BIRTH_DATE,
            ownerId: john!.id,
        })
        .returning();
    const [pet2] = await db
        .insert(pet)
        .values({
            name: "Pet2",
            birthDate: PET_2_BIRTH_DATE,
            ownerId: john!.id,
        })
        .returning();
    console.log(`Created pet: ${pet1!.name} (Owner: ${john!.name})`);
    console.log(`Created pet: ${pet2!.name} (Owner: ${john!.name})`);

    console.log("Creating veterinary specialties...");
    await db
        .insert(specialty)
        .values([{ name: "Exotic" }, { name: "Dogs" }, { name: "Cats" }]);
    console.log("Created specialties: Exotic, Dogs, Cats");

    console.log("Creating veterinarians...");
    const [akua] = await db
        .insert(vet)
        .values({ name: "Akua Mansa" })
        .returning();
    const [carlos] = await db
        .insert(vet)
        .values({ name: "Carlos Salazar" })
        .returning();

    await db.insert(specialtyToVet).values([
        { specialtyName: "Exotic", vetId: akua!.id },
        { specialtyName: "Cats", vetId: carlos!.id },
        { specialtyName: "Dogs", vetId: carlos!.id },
    ]);
    console.log(`Created vet: ${akua!.name} (Specialty: Exotic)`);
    console.log(`Created vet: ${carlos!.name} (Specialties: Cats, Dogs)`);

    return {
        ownerIds: [john!.id, mary!.id],
        petIds: [pet1!.id, pet2!.id],
        vetIds: [akua!.id, carlos!.id],
    };
}

async function verifyPets(db: DsqlDatabase) {
    console.log("Querying pet information...");

    const pet1 = await db.query.pet.findFirst({
        where: eq(pet.name, "Pet1"),
        with: { owner: true },
    });
    assert(pet1, "Pet1 not found");
    assert.equal(pet1.name, "Pet1");
    assert.equal(
        pet1.birthDate.toISOString().slice(0, 10),
        PET_1_BIRTH_DATE.toISOString().slice(0, 10),
    );
    assert.equal(pet1.owner?.name, "John Doe");

    const pet2 = await db.query.pet.findFirst({
        where: eq(pet.name, "Pet2"),
        with: { owner: true },
    });
    assert(pet2, "Pet2 not found");
    assert.equal(pet2.name, "Pet2");
    assert.equal(
        pet2.birthDate.toISOString().slice(0, 10),
        PET_2_BIRTH_DATE.toISOString().slice(0, 10),
    );
    assert.equal(pet2.owner?.name, "John Doe");
}

async function verifyOwners(db: DsqlDatabase) {
    console.log("Querying owner information...");

    const john = await db.query.owner.findFirst({
        where: eq(owner.name, "John Doe"),
        with: { pets: true },
    });
    assert(john, "John Doe not found");
    assert.equal(john.city, "New York");
    assert.equal(john.telephone, null);
    assert.equal(john.pets.length, 2);

    const mary = await db.query.owner.findFirst({
        where: eq(owner.name, "Mary Major"),
        with: { pets: true },
    });
    assert(mary, "Mary Major not found");
    assert.equal(mary.city, "Anytown");
    assert.equal(mary.telephone, "555-555-0123");
    assert.equal(mary.pets.length, 0);
}

async function verifyVets(db: DsqlDatabase) {
    console.log("Querying veterinarians with specialties...");

    const akua = await db.query.vet.findFirst({
        where: eq(vet.name, "Akua Mansa"),
        with: {
            specialties: {
                with: { specialty: true },
                orderBy: [asc(specialtyToVet.specialtyName)],
            },
        },
    });
    assert(akua, "Akua Mansa not found");
    const akuaSpecialties = akua.specialties.map((s) => s.specialty.name);
    assert.equal(akuaSpecialties.length, 1);
    assert.equal(akuaSpecialties[0], "Exotic");

    const carlos = await db.query.vet.findFirst({
        where: eq(vet.name, "Carlos Salazar"),
        with: {
            specialties: {
                with: { specialty: true },
                orderBy: [asc(specialtyToVet.specialtyName)],
            },
        },
    });
    assert(carlos, "Carlos Salazar not found");
    const carlosSpecialties = carlos.specialties.map((s) => s.specialty.name);
    assert.equal(carlosSpecialties.length, 2);
    assert.equal(carlosSpecialties[0], "Cats");
    assert.equal(carlosSpecialties[1], "Dogs");
}

async function cleanup(
    db: DsqlDatabase,
    ids: {
        ownerIds: string[];
        petIds: string[];
        vetIds: string[];
    },
) {
    console.log("Cleaning up...");
    for (const id of ids.vetIds) {
        await db.delete(specialtyToVet).where(eq(specialtyToVet.vetId, id));
    }
    for (const id of ids.petIds) {
        await db.delete(pet).where(eq(pet.id, id));
    }
    for (const id of ids.ownerIds) {
        await db.delete(owner).where(eq(owner.id, id));
    }
    for (const name of ["Exotic", "Dogs", "Cats"]) {
        await db.delete(specialty).where(eq(specialty.name, name));
    }
    for (const id of ids.vetIds) {
        await db.delete(vet).where(eq(vet.id, id));
    }
    console.log("Cleanup complete.");
}
