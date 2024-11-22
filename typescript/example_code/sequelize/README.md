# Sequelize with Aurora DSQL

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
* Aurora DSQL JavaScript SDK is required to run Sequelize with DSQL. Following [Aurora DSQL user guide](https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html) for JavaScript SDK installation. [TODO: update the link here with office link when the user guide is released]

## Setup the environment
1. Install Aurora DSQL SDK. Following (user guide)[https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html] for JavaScript SDK installation.

2. On local environment, initialize TypeScript project with:
```sh
npx tsc --init
```

3. Install required dependencies including SQLAlchemy
```sh
npm install --save sequelize
npm install --save pg pg-hstore
```

## Connect to a cluster
Create a DSQL engine using Sequelize

Note that in the dialect options you must set `clientMinMessages` to ignore, or an error will occur.
```ts
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { Sequelize, DataTypes, Model } from 'sequelize';

async function getSequelizeConnection(): Promise<Sequelize> {
  const endpoint = process.env.CLUSTER_ENDPOINT;
  const region = process.env.CLUSTER_REGION!;
  const signer = new DsqlSigner({
    hostname: endpoint,
    region,
  });
  const token = await signer.getDbConnectAdminAuthToken();
  return new Sequelize("postgres", "admin", token, {
    host: endpoint,
    port: 5432,
    dialect: 'postgres',
    logging: console.log, // Set to console.log to see SQL queries
    dialectOptions: {
      clientMinMessages: 'ignore', // This is essential
      skipIndexes: true,
      ssl: {
        mode: 'verify-full'
      }
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  })
}
```

### Limitations with DSQL

#### Sequelize.sync() does not work with DSQL

Attempting to create or modify tables using `Sequelize.sync()` will result in an error. This can be worked around by creating tables in advance separately using the `QueryInterface`. The `QueryInterface.createTable()` function allows table creation, and `QueryInterface.query()` allows arbitrary SQL statements to be executed, including schema modification or index creation. Note that if you create tables directly using the Query Interface, you still need to initialize the model, as shown in the example below. This initializes the model in memory for Sequelize execution, whereas the Query Interface interacts with the database.

#### Foreign key constraints

Foreign key constraints are not supported by DSQL, so you cannot use the `references` keyword in your table creation.

### Connection Pooling

In Sequelize, [connection pooling](https://sequelize.org/docs/v6/other-topics/connection-pool/) is enabled by default when the Sequelize instance is created; each engine is automatically associated with a connection pool in the background. Once the connection pool is started, all the connections will have the initial set of credentials. The Aurora DSQL connection session expires after 1 hour, regardless of the token expiration time. If the token is expired, the instance will not be able to create new connections to Aurora DSQL. A new instance has to be created for Sequelize to pick up valid new credentials and create connections to Aurora DSQL. 

## Create models

> [!NOTE]
>
> Note that Aurora DSQL does not support SERIAL, so id is based on uuid (suggest best practice guide on this TBD: Update link)

Owner table has one-to-many relationship with Pet table.
Vet table has many-to-many relationship with Specialty table.

### Create models
```ts
class Owner extends Model {
  declare id: string;
  declare name: string;
  declare city: string;
  declare telephone: string | null;
}

class Pet extends Model {
  declare id: string;
  declare name: string;
  declare birthDate: Date;
  declare ownerId: string | null;
}

class VetSpecialties extends Model {
  declare id: string;
  declare vetId: string | null;
  declare specialtyId: string | null;
}

class Specialty extends Model {
  declare id: string;
}

class Vet extends Model {
  declare id: string;
  declare name: string;
  declare Specialties?: Specialty[];
  declare setSpecialties: (specialties: Specialty[]) => Promise<void>;
}

async function createTables(sequelize: Sequelize) {
  // Create tables in DB - workaround for Sequelize.sync()
  await queryInterface.createTable('owner', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(30), allowNull: false },
    city: { type: DataTypes.STRING(80), allowNull: false },
    telephone: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null }
  });

  await queryInterface.createTable('pet', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(30), allowNull: false },
    birthDate: { type: DataTypes.DATEONLY, allowNull: false },
    ownerId: { type: DataTypes.UUID, allowNull: true }
  });

  await queryInterface.createTable('specialty', {
    id: { type: DataTypes.STRING(80), primaryKey: true, field: 'name' }
  });

  await queryInterface.createTable('vet', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(30), allowNull: false }
  });

  await queryInterface.createTable('vetSpecialties', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    vetId: { type: DataTypes.UUID, allowNull: true },
    specialtyId: { type: DataTypes.STRING(80), allowNull: true }
  });

  // Initialize Sequelize models in memory
  Owner.init({
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(30), allowNull: false },
    city: { type: DataTypes.STRING(80), allowNull: false },
    telephone: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null }
  }, { sequelize, tableName: 'owner' });

  Pet.init({
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(30), allowNull: false },
    birthDate: { type: DataTypes.DATEONLY, allowNull: false },
    ownerId: { type: DataTypes.UUID, allowNull: true }
  }, { sequelize, tableName: 'pet', });

  VetSpecialties.init({
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    vetId: { type: DataTypes.UUID, allowNull: true },
    specialtyId: { type: DataTypes.STRING(80), allowNull: true }
  }, { sequelize, tableName: 'vetSpecialties', });

  Specialty.init({
    id: { type: DataTypes.STRING(80), primaryKey: true, field: 'name' }
  }, { sequelize, tableName: 'specialty', });

  Vet.init({
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(30), allowNull: false }
  }, { sequelize, tableName: 'vet', });

  // Create relationships, note that constraints must be false.
  Pet.belongsTo(Owner, { foreignKey: 'ownerId', constraints: false });
  Owner.hasMany(Pet, { foreignKey: 'ownerId', constraints: false });
  Vet.belongsToMany(Specialty, { through: VetSpecialties, foreignKey: 'vetId', otherKey: 'specialtyId', constraints: false });
  Specialty.belongsToMany(Vet, { through: VetSpecialties, foreignKey: 'specialtyId', otherKey: 'vetId', constraints: false, as: 'Specialties' });
}
```

## Execute Examples

> [!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)


### Example showing interactions with Aurora DSQL
```ts
async function sequelizeExample(sequelize: Sequelize) {
    // Create two Owners and two pets, inserting to DB
  const john = await Owner.create({ name: "John Doe", city: "Anytown" });
  await Owner.create({ name: "Mary Major", telephone: "555-555-0123", city: "Anytown" });
  await Pet.create({ name: "Pet1", birthDate: "2006-10-25", ownerId: john.id })
  await Pet.create({ name: "Pet2", birthDate: "2021-07-23", ownerId: john.id })

  const pet1 = await Pet.findOne({
    where: {
      name: 'Pet1'
    }
  });

  console.log(`Pet1 ID: ${pet1!.id}, Name: ${pet1!.name}, Birth date: ${pet1!.birthDate}, Owner ID: ${pet1!.ownerId}`);
  if (pet1!.name != "Pet1") throw new Error(`Incorrect query result, expected: "Pet1", actual: ${pet1!.name}`);

  // Get the corresponding owner
  const johnResult = await Owner.findOne({ where: { id: pet1!.ownerId } });

  console.log(`John ID: ${johnResult!.id}, Name: ${johnResult!.name}, City: ${johnResult!.city}, Telephone: ${johnResult!.telephone}`);
  if (johnResult!.name != "John Doe") throw new Error(`Incorrect query result, expected: "John Doe", actual: ${pet1!.name}`);

  // Vet-Specialty relationship is many to many
  // Inserting three vets with specialties
  const [exotic, dogs, cats] = await Specialty.bulkCreate([
    { id: 'Exotic' },
    { id: 'Dogs' },
    { id: 'Cats' }
  ]);

  // Create vets
  const akua = await Vet.create({ name: 'Akua Mansa' });
  const carlos = await Vet.create({ name: 'Carlos Salazar' });
  // Add specialties, automatically inserts to VetSpecialties table
  await akua.setSpecialties([exotic]);
  await carlos.setSpecialties([cats, dogs]);

  // Read back vets
  const akuaResult = await Vet.findOne({
    where: { name: 'Akua Mansa' },
    include: [{
      model: Specialty,
      as: 'Specialties'
    }]
  });

  const carlosResult = await Vet.findOne({
    where: { name: 'Carlos Salazar' },
    include: [{
      model: Specialty,
      as: 'Specialties'
    }]
  });

  console.log(`Akua Mansa ID: ${akuaResult?.id}, Name: ${akuaResult?.name}, Specialties:`, akuaResult?.Specialties);
  console.log(`Carlos Salazar ID: ${carlosResult?.id}, Name: ${carlosResult?.name}, Specialties:`, carlosResult?.Specialties);

  // Get specialties from vets and check read value
  if (akuaResult?.Specialties?.[0]) {
    const exotic = await Specialty.findByPk(akuaResult.Specialties[0].id);
    console.log(`Exotic ID: ${exotic?.id}`);
    if (exotic!.id != "Exotic") throw new Error(`Incorrect query result, expected: "Exotic", actual: ${exotic?.id}`);
  }

  if (carlosResult?.Specialties?.[0]) {
    const cats = await Specialty.findByPk(carlosResult.Specialties[0].id);
    console.log(`Cats ID: ${cats?.id}`);
    if (cats!.id != "Cats") throw new Error(`Incorrect query result, expected: "Cats", actual: ${cats?.id}`);
  }

  if (carlosResult?.Specialties?.[1]) {
    const dogs = await Specialty.findByPk(carlosResult.Specialties[1].id);
    console.log(`Dogs ID: ${dogs?.id}`);
    if (dogs!.id != "Dogs") throw new Error(`Incorrect query result, expected: "Dogs", actual: ${dogs?.id}`);
  }
}
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0