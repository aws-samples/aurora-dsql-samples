import assert from "node:assert";
import getDataSource from "./data-source";
import { Owner } from "./entity/Owner";
import { Pet } from "./entity/Pet";
import { Specialty } from "./entity/Specialty";
import { Vet } from "./entity/Vet";
import { DataSource } from "typeorm";
import { getEnvironmentVariables } from "./utils";
import { escapeIdentifier } from "pg/lib/utils";

const main = async (AppDataSource: DataSource) => {
  const ownerRepository = AppDataSource.getRepository(Owner);
  const petRepository = AppDataSource.getRepository(Pet);
  const specialtyRepository = AppDataSource.getRepository(Specialty);
  const vetRepository = AppDataSource.getRepository(Vet);

  const pet1 = new Pet();
  pet1.name = "Pet-1";
  pet1.birthDate = new Date(Date.UTC(2006, 9, 25)); // UTC Month is between 0-11. October is 9 instead of 10

  const pet2 = new Pet();
  pet2.name = "Pet-2";
  pet2.birthDate = new Date(Date.UTC(2021, 6, 23)); // UTC Month is between 0-11. July is 6 instead of 7

  const johnDoe = new Owner();
  johnDoe.name = "John Doe";
  johnDoe.city = "Any town";
  johnDoe.pets = [pet1];

  const maryMajor = new Owner();
  maryMajor.name = "Mary Major";
  maryMajor.city = "Any city";
  maryMajor.telephone = "555-5555-0123";
  maryMajor.pets = [pet2];

  const owners = ownerRepository.create([johnDoe, maryMajor]);
  await ownerRepository.save(owners);

  const dogs = new Specialty();
  dogs.name = "dogs";
  const cats = new Specialty();
  cats.name = "cats";

  const carlosSalazar = new Vet();
  carlosSalazar.name = "Carlos Salazar";
  carlosSalazar.specialties = [dogs, cats];

  await vetRepository.save(carlosSalazar);

  // Read back data for the pet
  const petQuery = await petRepository.findOne({
    where: { name: "Pet-1" },
    relations: {
      owner: true,
    },
  });

  assert(petQuery !== null, "petQuery returned null");
  assert.equal(petQuery.name, "Pet-1");
  assert.equal(petQuery.birthDate.toISOString(), "2006-10-25T00:00:00.000Z");

  // Get the corresponding owner
  const ownerQuery = await ownerRepository.findOne({
    where: { id: petQuery.owner.id },
    relations: {
      pets: true,
    },
  });

  // Owner must be what we have inserted
  assert.equal(ownerQuery.name, "John Doe");
  assert.equal(ownerQuery.city, "Any town");

  // Read back data for the vets
  const vetQuery = await vetRepository.findOne({
    where: { name: "Carlos Salazar" },
    relations: {
      specialties: true,
    },
    order: {
      specialties: {
        name: "ASC",
      },
    },
  });

  assert.equal(vetQuery?.name, "Carlos Salazar");
  assert.equal(vetQuery?.specialties[0]?.name, "cats");
  assert.equal(vetQuery?.specialties[1]?.name, "dogs");
  assert(
    vetQuery?.specialties
      ?.map((s) => s.name)
      .some((item) => ["dogs", "cats"].includes(item))
  );

  const johnResult = await ownerRepository.findOne({
    where: { name: "John Doe" },
    relations: {
      pets: true,
    },
  });

  const maryResult = await ownerRepository.findOne({
    where: { name: "Mary Major" },
    relations: {
      pets: true,
    },
  });

  // Clean up
  await petRepository.remove(johnResult.pets);
  await ownerRepository.remove(johnResult);
  await petRepository.remove(maryResult.pets);
  await ownerRepository.remove(maryResult);
  await specialtyRepository.remove([dogs, cats]);
  await vetRepository.remove(carlosSalazar);
};

const executeSqlStatementWithRetry = async (
  dataSource: DataSource,
  sqlStatement: string,
  maxRetries = 5
) => {
  let retries = 0;

  while (retries < maxRetries) {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(sqlStatement);

      await queryRunner.commitTransaction();
      return;
    } catch (err) {
      await queryRunner.rollbackTransaction();

      retries++;
      if (retries >= maxRetries) {
        throw new Error(
          `Maximum retries (${maxRetries}) reached. Last error: ${err.message}`
        );
      }
      if (err.message.includes("OC001") || err.message.includes("OC000")) {
        console.log(
          `Error occurred when executing statement ${sqlStatement}, executing retry`
        );
      }
    } finally {
      await queryRunner.release();
    }
  }
};

const retryExample = async (AppDataSource: DataSource) => {
  // Create and drop the table, will retry with default 5 retries
  await executeSqlStatementWithRetry(
    AppDataSource,
    "CREATE TABLE IF NOT EXISTS abc (id UUID NOT NULL);"
  );
  await executeSqlStatementWithRetry(
    AppDataSource,
    "DROP TABLE IF EXISTS abc;"
  );

  // Run statement that will fail, it will not be retried as the error is not OC001 or OC000
  try {
    await executeSqlStatementWithRetry(AppDataSource, "DROP TABLE abc;");
  } catch (err: any) {
    // Expected failure
  }

  // Create and drop the table, with maximum retries of 3
  await executeSqlStatementWithRetry(
    AppDataSource,
    "CREATE TABLE IF NOT EXISTS abc (id UUID NOT NULL);",
    3
  );
  await executeSqlStatementWithRetry(
    AppDataSource,
    "DROP TABLE IF EXISTS abc;",
    3
  );
};

export const runExamples = async () => {
  let AppDataSource = await getDataSource;
  await AppDataSource.initialize();
  const { user } = getEnvironmentVariables();

  let schema = "public";
  if (user !== "admin") {
    schema = "myschema";
  }

  // Sets default schema
  await AppDataSource.manager.connection.query(
    `SET search_path = ${escapeIdentifier(schema)};`
  );

  try {
    await main(AppDataSource);
    await retryExample(AppDataSource);
  } catch (error) {
    console.error("Error running examples:", error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};
