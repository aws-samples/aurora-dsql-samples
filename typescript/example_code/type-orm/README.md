# TypeORM with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Setup the environment
3. Connect to a cluster
   - Limitations
   - Connection Pooling
4. Create models
5. Execute create and read Examples

## Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region configured as described in the 
[AWS Tools and SDKs Shared Configuration and Credentials Reference Guide](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html).
* [NodeJS 18.0.0 or later](https://nodejs.org/en) - You can verify your NodeJS installation with `node -v`
* [TypeScript 5.6 or later](https://www.typescriptlang.org/download/) - You can verify your TypeScript installation with `npx tsc --init`
* Aurora DSQL JavaScript SDK is required to run Sequelize with DSQL. Following [Aurora DSQL user guide](https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html) for JavaScript SDK installation. [TODO: update the link here with official link when the user guide is released]

## Setup the environment
1. Install Aurora DSQL SDK. Following (user guide)[https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html] for JavaScript SDK installation.

2. On local environment, initialize TypeScript project with:
```sh
npx tsc --init
```

3. Install required dependencies
```sh
npm install
```

## Connect to a cluster
Create a DSQL DataSource using TypeORM

```ts
import "reflect-metadata";
import { DataSource } from "typeorm";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { join } from "path";

const clusterEndpoint = "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws";
const region = "us-east-1";

const signer = new DsqlSigner({
    hostname: clusterEndpoint,
    region: region
});

const getDataSource = async () => {

  const token = await signer.getDbConnectAdminAuthToken();
  const AppDataSource = new DataSource({
    type: "postgres",
    host: clusterEndpoint,
    port: 5432,
    username: "admin",
    password: token,
    database: "postgres",
    ssl: true,
    synchronize: false,
    logging: false,
    entities: [join(__dirname, "/entity/**/*{.ts,.js}")],
    schema: "public",
    migrations: [join(__dirname, "/migrations/**/*{.ts,.js}")],
    migrationsRun: false,
  });
  return AppDataSource;
}

export default getDataSource();
```

### Limitations with DSQL

#### TypeORM DataSource options: Synchronize: true and MigrationsRun: true does not work with DSQL

Attempting to create or modify tables using `synchronize: true` or `migrationsRun: false` will result in an error. This can be worked around by creating a migrations table in advance with `Primary Key` with a type different than `SERIAL` and creating the tables using a migrations file and the `--transaction none` flag enabled. The main issue with setting `migrationsRun` and `synchronize` to `true` is that both operations will start a transaction and create `SQL` commands with multiple ddl statements which are not supported by DSQL.

#### Foreign key constraints

Foreign key constraints are not supported by DSQL, so you cannot use the `references` keyword in your table creation.

### Connection Pooling

In TypeORM, [connection pooling](https://typeorm.io/data-source-options#common-data-source-options) is enabled by default when the Sequelize instance is created; each engine is automatically associated with a connection pool in the background. Once the connection pool is started, all the connections will have the initial set of credentials. The Aurora DSQL connection session expires after 1 hour, regardless of the token expiration time. If the token is expired, the instance will not be able to create new connections to Aurora DSQL. A new instance has to be created for TypeORM to pick up valid new credentials and create connections to Aurora DSQL. 

## Create models

> [!NOTE]
>
> Note that Aurora DSQL does not support SERIAL, so id is based on a globally unique id (suggest best practice guide on this TBD: Update link). Using a unique id strategy for database ids guarantees globally unique identifiers across different systems and databases, making them ideal for distributed systems.

Owner table has one-to-many relationship with Pet table.
Vet table has many-to-many relationship with Specialty table.

### Create models
```sh
npm run migrations-create-table
npm run migrations-run
```

## Execute Examples

> [!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)


### Example showing interactions with Aurora DSQL
```ts
const main = async () => {
    const AppDataSource = await getDataSource;
    await AppDataSource.initialize();
    const ownerRepository = AppDataSource.getRepository(Owner);
    const petRepository = AppDataSource.getRepository(Pet);
    const specialtyRepository = AppDataSource.getRepository(Specialty);
    const vetRepository = AppDataSource.getRepository(Vet);


    const pet1 = new Pet();
    pet1.name = "Pet-1";
    pet1.birthDate = new Date("2006-10-25")

    const pet2 = new Pet();
    pet2.name = "Pet-2";
    pet2.birthDate = new Date("2021-07-23");

    const johnDoe = new Owner();
    johnDoe.name = "John Doe";
    johnDoe.city = "Anytown";
    johnDoe.pets = [pet1]

    const maryMajor = new Owner();
    maryMajor.name = "Mary Major";
    maryMajor.city = "Anycity"
    maryMajor.telephone = "555-5555-0123";
    maryMajor.pets = [pet2]

    const owners = ownerRepository.create([johnDoe, maryMajor]);
    await ownerRepository.save(owners)

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
            owner: true
        }
    })

    // Get the corresponding owner
    const ownerQuery = await ownerRepository.findOne({
        where: { id: petQuery.owner.id },
        relations: {
            pets: true
        }
    })

    // Test: check read values
    assert.equal(petQuery.name, "Pet-1");
    assert.equal(petQuery.birthDate.toISOString(), "2006-10-25T00:00:00.000Z")
    // Owner must be what we have inserted
    assert.equal(ownerQuery.name, "John Doe");
    assert.equal(ownerQuery.city, "Anytown");


    // Read back data for the vets
    const vetQuery = await vetRepository.findOne({
        where: { name: "Carlos Salazar" },
        relations: {
            specialties: true
        }
    })

    assert.equal(vetQuery?.name, "Carlos Salazar");
    assert.equal(vetQuery?.specialties[0]?.name, "cats")
    assert.equal(vetQuery?.specialties[1]?.name, "dogs")
    assert(vetQuery?.specialties?.map(s => s.name).some(item => ["dogs", "cats"].includes(item)))

    const johnResult = await ownerRepository.findOne({
        where: { name: "John Doe" },
        relations: {
            pets: true
        }
    })

    const maryResult = await ownerRepository.findOne({
        where: { name: "Mary Major" },
        relations: {
            pets: true
        }
    })

    // Clean up
    await petRepository.remove(johnResult.pets)
    await ownerRepository.remove(johnResult)
    await petRepository.remove(maryResult.pets)
    await ownerRepository.remove(maryResult)
    await specialtyRepository.remove([dogs, cats])
    await vetRepository.remove(carlosSalazar);

    if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
    }
}
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0