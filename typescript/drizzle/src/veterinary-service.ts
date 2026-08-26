import { eq } from "drizzle-orm";
import type { VeterinaryDb } from "./dsql-client";
import { owner, pet, specialty, specialtyToVet, vet } from "./schema";

export class VeterinaryService {
  constructor(private readonly db: VeterinaryDb) {}

  async createOwner(name: string, city: string, telephone?: string) {
    const [row] = await this.db
      .insert(owner)
      .values({ name, city, telephone: telephone ?? null })
      .returning();
    return row!;
  }

  async createPet(name: string, birthDate: Date, ownerId: string) {
    const [row] = await this.db
      .insert(pet)
      .values({ name, birthDate, ownerId })
      .returning();
    return row!;
  }

  async createSpecialty(name: string) {
    const [row] = await this.db.insert(specialty).values({ name }).returning();
    return row!;
  }

  async createVet(name: string, specialtyNames: string[]) {
    return this.db.transactionWithRetry(async (tx) => {
      const [row] = await tx.insert(vet).values({ name }).returning();
      if (specialtyNames.length > 0) {
        await tx.insert(specialtyToVet).values(
          specialtyNames.map((specialtyName) => ({
            specialtyName,
            vetId: row!.id,
          })),
        );
      }
      return row!;
    });
  }

  async getPetWithOwner(petName: string) {
    return this.db.query.pet.findFirst({
      where: eq(pet.name, petName),
      with: { owner: true },
    });
  }

  async getOwnerWithPets(ownerName: string) {
    return this.db.query.owner.findFirst({
      where: eq(owner.name, ownerName),
      with: { pets: true },
    });
  }

  async getVetWithSpecialties(vetName: string) {
    return this.db.query.vet.findFirst({
      where: eq(vet.name, vetName),
      with: { specialties: { with: { specialty: true } } },
    });
  }
}
