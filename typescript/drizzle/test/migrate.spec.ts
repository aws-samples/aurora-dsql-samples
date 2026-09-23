import fs from "node:fs";
import path from "node:path";

describe("committed migrations", () => {
  test("creates foreign keys in the initial table definitions", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "drizzle/0000_init.sql"),
      "utf8",
    );

    expect(migration).toMatch(
      /CREATE TABLE "pet"[\s\S]*FOREIGN KEY \("owner_id"\)\s+REFERENCES "owner"\("id"\)/,
    );
    expect(migration).toMatch(
      /CREATE TABLE "specialty_to_vet"[\s\S]*FOREIGN KEY \("specialty_name"\)\s+REFERENCES "specialty"\("name"\)/,
    );
    expect(migration).toMatch(
      /CREATE TABLE "specialty_to_vet"[\s\S]*FOREIGN KEY \("vet_id"\)\s+REFERENCES "vet"\("id"\)/,
    );
    expect(migration).not.toMatch(
      /ALTER TABLE[\s\S]*ADD CONSTRAINT[\s\S]*FOREIGN KEY/i,
    );
  });
});
