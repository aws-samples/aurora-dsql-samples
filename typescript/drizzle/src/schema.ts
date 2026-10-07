import { relations, sql } from "drizzle-orm";
import {
  date,
  index,
  pgTable,
  primaryKey,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Primary keys are UUIDs defaulted with gen_random_uuid(): random keys spread
// writes across DSQL's distributed storage instead of contending on one end of
// a monotonic sequence. Integer auto-increment is available too — via identity
// columns (`GENERATED ... AS IDENTITY`), which is what dsql-lint rewrites the
// `SERIAL` keyword into.
//
// Database foreign keys and Drizzle's relations metadata describe the same
// relationships. RESTRICT avoids unbounded cascading modifications.

export const owner = pgTable("owner", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 30 }).notNull(),
  city: varchar("city", { length: 80 }).notNull(),
  telephone: varchar("telephone", { length: 20 }),
});

export const pet = pgTable(
  "pet",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 30 }).notNull(),
    birthDate: date("birth_date", { mode: "date" }).notNull(),
    ownerId: uuid("owner_id").references(() => owner.id, {
      onDelete: "restrict",
      onUpdate: "restrict",
    }),
  },
  (table) => [index("pet_owner_id_idx").on(table.ownerId)],
);

export const specialty = pgTable("specialty", {
  name: varchar("name", { length: 80 }).primaryKey(),
});

export const vet = pgTable("vet", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 30 }).notNull(),
});

// Join table for the many-to-many between vets and specialties.
export const specialtyToVet = pgTable(
  "specialty_to_vet",
  {
    specialtyName: varchar("specialty_name", { length: 80 })
      .notNull()
      .references(() => specialty.name, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    vetId: uuid("vet_id")
      .notNull()
      .references(() => vet.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
  },
  (table) => [primaryKey({ columns: [table.specialtyName, table.vetId] })],
);

export const ownerRelations = relations(owner, ({ many }) => ({
  pets: many(pet),
}));

export const petRelations = relations(pet, ({ one }) => ({
  owner: one(owner, { fields: [pet.ownerId], references: [owner.id] }),
}));

export const vetRelations = relations(vet, ({ many }) => ({
  specialties: many(specialtyToVet),
}));

export const specialtyRelations = relations(specialty, ({ many }) => ({
  vets: many(specialtyToVet),
}));

export const specialtyToVetRelations = relations(specialtyToVet, ({ one }) => ({
  specialty: one(specialty, {
    fields: [specialtyToVet.specialtyName],
    references: [specialty.name],
  }),
  vet: one(vet, { fields: [specialtyToVet.vetId], references: [vet.id] }),
}));
