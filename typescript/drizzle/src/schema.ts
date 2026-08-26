/**
 * Drizzle ORM schema for the veterinary domain model.
 *
 * Aurora DSQL supports sequences and identity columns (with CACHE specified),
 * but the SERIAL pseudo-type is not available. This sample defines foreign
 * keys in the initial table DDL and uses RESTRICT to avoid cascading writes.
 * UUIDs with gen_random_uuid() are the recommended primary key type.
 */
import { relations, sql } from "drizzle-orm";
import { pgTable, uuid, varchar, date, primaryKey } from "drizzle-orm/pg-core";

export const owner = pgTable("owner", {
    id: uuid()
        .primaryKey()
        .default(sql`gen_random_uuid()`),
    name: varchar({ length: 30 }).notNull(),
    city: varchar({ length: 80 }).notNull(),
    telephone: varchar({ length: 20 }),
});

export const pet = pgTable("pet", {
    id: uuid()
        .primaryKey()
        .default(sql`gen_random_uuid()`),
    name: varchar({ length: 30 }).notNull(),
    birthDate: date({ mode: "date" }).notNull(),
    ownerId: uuid("owner_id").references(() => owner.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
    }),
});

export const specialty = pgTable("specialty", {
    name: varchar({ length: 80 }).primaryKey(),
});

export const vet = pgTable("vet", {
    id: uuid()
        .primaryKey()
        .default(sql`gen_random_uuid()`),
    name: varchar({ length: 30 }).notNull(),
});

export const specialtyToVet = pgTable(
    "_SpecialtyToVet",
    {
        specialtyName: varchar("A", { length: 80 })
            .notNull()
            .references(() => specialty.name, {
                onDelete: "restrict",
                onUpdate: "restrict",
            }),
        vetId: uuid("B")
            .notNull()
            .references(() => vet.id, {
                onDelete: "restrict",
                onUpdate: "restrict",
            }),
    },
    (t) => [primaryKey({ columns: [t.specialtyName, t.vetId] })],
);

// ORM relation metadata complements the database constraints above.

export const ownerRelations = relations(owner, ({ many }) => ({
    pets: many(pet),
}));

export const petRelations = relations(pet, ({ one }) => ({
    owner: one(owner, {
        fields: [pet.ownerId],
        references: [owner.id],
    }),
}));

export const specialtyRelations = relations(specialty, ({ many }) => ({
    vets: many(specialtyToVet),
}));

export const vetRelations = relations(vet, ({ many }) => ({
    specialties: many(specialtyToVet),
}));

export const specialtyToVetRelations = relations(specialtyToVet, ({ one }) => ({
    specialty: one(specialty, {
        fields: [specialtyToVet.specialtyName],
        references: [specialty.name],
    }),
    vet: one(vet, {
        fields: [specialtyToVet.vetId],
        references: [vet.id],
    }),
}));
