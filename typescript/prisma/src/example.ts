import { VeterinaryService } from "./veterinary-service";
import assert from "node:assert";

const PET_1_BIRTH_DATE = new Date("2006-10-25");
const PET_2_BIRTH_DATE = new Date("2021-07-23");

export async function runVeterinaryExample(service: VeterinaryService) {
    await populateDb(service);

    await verifyPet(service);
    await verifyOwners(service);
    await verifyVets(service);
}

async function populateDb(service: VeterinaryService) {
    console.log("Creating owners...");
    const john = await service.createOwner("John Doe", "New York");
    const mary = await service.createOwner(
        "Mary Major",
        "Anytown",
        "555-555-0123",
    );
    console.log(`Created owner: ${john.name} (ID: ${john.id})`);
    console.log(`Created owner: ${mary.name} (ID: ${mary.id})`);

    console.log("Creating pets...");
    const pet1 = await service.createPet("Pet1", PET_1_BIRTH_DATE, john);
    const pet2 = await service.createPet("Pet2", PET_2_BIRTH_DATE, john);
    console.log(`Created pet: ${pet1.name} (Owner: ${john.name})`);
    console.log(`Created pet: ${pet2.name} (Owner: ${john.name})`);

    console.log("Creating veterinary specialties...");
    const exotic = await service.createSpecialty("Exotic");
    const dogs = await service.createSpecialty("Dogs");
    const cats = await service.createSpecialty("Cats");
    console.log(
        `Created specialties: ${[exotic, dogs, cats].map((s) => s.name).join(", ")}`,
    );

    console.log("Creating veterinarians...");
    const akua = await service.createVet("Akua Mansa", [exotic]);
    const carlos = await service.createVet("Carlos Salazar", [cats, dogs]);
    console.log(`Created vet: ${akua.name} (Specialty: ${exotic.name})`);
    console.log(
        `Created vet: ${carlos.name} (Specialties: ${cats.name}, ${dogs.name})`,
    );
}

async function verifyPet(service: VeterinaryService) {
    console.log("Querying pet information...");

    const pet1 = await service.getPetWithOwner("Pet1");
    assert(pet1.name === "Pet1", `Pet ${pet1.name} != Pet1`);
    assert(
        pet1.birthDate.getTime() === PET_1_BIRTH_DATE.getTime(),
        `Pet1 birth ${pet1.birthDate} != ${PET_1_BIRTH_DATE}`,
    );
    assert(
        pet1.owner!.name === "John Doe",
        `Pet1 owner ${pet1.owner!.name} != John Doe`,
    );

    const pet2 = await service.getPetWithOwner("Pet2");
    assert(pet2.name === "Pet2", `Pet ${pet2.name} != Pet2`);
    assert(
        pet2.birthDate.getTime() === PET_2_BIRTH_DATE.getTime(),
        `Pet2 birth ${pet2.birthDate} != ${PET_2_BIRTH_DATE}`,
    );
    assert(
        pet2.owner!.name === "John Doe",
        `Pet2 owner ${pet2.owner!.name} != John Doe`,
    );
}

async function verifyOwners(service: VeterinaryService) {
    console.log("Querying owner information...");

    const john = await service.getOwnerWithPets("John Doe");
    assert(john.name === "John Doe", `Owner ${john.name} != John Doe`);
    assert(john.city === "New York", `John city ${john.city} != New York`);
    assert(john.telephone === null, `John telephone ${john.telephone}`);
    assert(john.pets.length === 2, `John pets ${john.pets.length} != 2`);

    const mary = await service.getOwnerWithPets("Mary Major");
    assert(mary.name === "Mary Major", `Owner ${mary.name} != Mary Major`);
    assert(mary.city === "Anytown", `Mary city ${mary.city} != Anytown`);
    assert(
        mary.telephone === "555-555-0123",
        `Mary telephone ${mary.telephone} != 555-555-0123`,
    );
    assert(mary.pets.length === 0, `Mary pets ${mary.pets.length} != 0`);
}

async function verifyVets(service: VeterinaryService) {
    console.log("Querying veterinarians with specialties...");

    const akua = await service.getVetWithSpecialties("Akua Mansa");
    const akuaSpecialties = akua.specialties.map((s) => s.name).sort();
    assert(akua.name === "Akua Mansa", `Vet ${akua.name} != Akua Mansa`);
    assert(
        akuaSpecialties.length === 1,
        `Akua specialties ${akuaSpecialties.length} != 1`,
    );
    assert(
        akuaSpecialties[0] === "Exotic",
        `Akua specialty ${akuaSpecialties[0]} != Exotic`,
    );

    const carlos = await service.getVetWithSpecialties("Carlos Salazar");
    const carlosSpecialties = carlos.specialties.map((s) => s.name).sort();
    assert(
        carlos.name === "Carlos Salazar",
        `Vet ${carlos.name} != Carlos Salazar`,
    );
    assert(
        carlosSpecialties.length === 2,
        `Carlos specialties ${carlosSpecialties.length} != 2`,
    );
    assert(
        carlosSpecialties[0] === "Cats",
        `Carlos specialty ${carlosSpecialties[0]} != Cats`,
    );
    assert(
        carlosSpecialties[1] === "Dogs",
        `Carlos specialty ${carlosSpecialties[1]} != Dogs`,
    );
}
