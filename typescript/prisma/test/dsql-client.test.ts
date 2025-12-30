import { DsqlPrismaClient } from "../src/dsql-client";

jest.setTimeout(60000);

describe("DSQL Prisma client", () => {
    let client: DsqlPrismaClient;

    beforeAll(() => {
        client = new DsqlPrismaClient();
    });

    afterAll(async () => {
        await client.dispose();
    });

    test("basic query works", async () => {
        const result = await client.$queryRaw`SELECT 1 as test`;
        expect(result).toEqual([{ test: 1 }]);
    });

    test("CRUD operations work", async () => {
        // Create
        const owner = await client.owner.create({
            data: {
                name: "Test Owner",
                city: "Seattle",
                telephone: "555-0100",
            },
        });
        expect(owner.id).toBeDefined();
        expect(owner.name).toBe("Test Owner");

        // Read
        const found = await client.owner.findUnique({
            where: { id: owner.id },
        });
        expect(found?.name).toBe("Test Owner");
        expect(found?.city).toBe("Seattle");

        // Update
        const updated = await client.owner.update({
            where: { id: owner.id },
            data: { city: "Portland" },
        });
        expect(updated.city).toBe("Portland");

        // Delete
        await client.owner.delete({ where: { id: owner.id } });

        // Verify deleted
        const deleted = await client.owner.findUnique({
            where: { id: owner.id },
        });
        expect(deleted).toBeNull();
    });

    test("relations work with relationMode prisma", async () => {
        // Create owner
        const owner = await client.owner.create({
            data: {
                name: "Pet Owner",
                city: "Boston",
            },
        });

        // Create pet with relation
        const pet = await client.pet.create({
            data: {
                name: "Buddy",
                birthDate: new Date("2020-01-15"),
                ownerId: owner.id,
            },
        });

        // Query with relation
        const ownerWithPets = await client.owner.findUnique({
            where: { id: owner.id },
            include: { pets: true },
        });

        expect(ownerWithPets?.pets).toHaveLength(1);
        expect(ownerWithPets?.pets[0]?.name).toBe("Buddy");

        // Clean up
        await client.pet.delete({ where: { id: pet.id } });
        await client.owner.delete({ where: { id: owner.id } });
    });

    test("UUID generation works", async () => {
        const owner = await client.owner.create({
            data: {
                name: "UUID Test",
                city: "Denver",
            },
        });

        // Verify UUID format (8-4-4-4-12 hex characters)
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(owner.id).toMatch(uuidRegex);

        await client.owner.delete({ where: { id: owner.id } });
    });
});
