import { DsqlPrismaClient } from "./dsql-client";
import { owner, specialty } from "@generated/prisma-vet/client";

export class VeterinaryService {
    constructor(private readonly prisma: DsqlPrismaClient) {}

    async createOwner(name: string, city: string, telephone?: string) {
        return this.prisma.owner.create({
            data: { name, city, telephone: telephone ?? null },
        });
    }

    async createPet(name: string, birthDate: Date, owner: owner) {
        return this.prisma.pet.create({
            data: {
                name,
                birthDate,
                owner: {
                    connect: owner,
                },
            },
        });
    }

    async createSpecialty(name: string) {
        return this.prisma.specialty.create({
            data: { name },
        });
    }

    async createVet(name: string, specialties: specialty[]) {
        return this.prisma.vet.create({
            data: {
                name,
                specialties: {
                    connect: specialties,
                },
            },
        });
    }

    async getPetWithOwner(petName: string) {
        return this.prisma.pet.findFirstOrThrow({
            where: { name: petName },
            include: { owner: true },
        });
    }

    async getOwnerWithPets(ownerName: string) {
        return this.prisma.owner.findFirstOrThrow({
            where: { name: ownerName },
            include: { pets: true },
        });
    }

    async getVetWithSpecialties(vetName: string) {
        return this.prisma.vet.findFirstOrThrow({
            where: { name: vetName },
            include: {
                specialties: {
                    orderBy: { name: "asc" },
                },
            },
        });
    }
}
