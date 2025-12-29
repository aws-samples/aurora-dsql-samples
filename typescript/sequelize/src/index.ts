import { AuroraDSQLClient } from "@aws/aurora-dsql-node-postgres-connector";
import * as pg from 'pg';
import { Sequelize, DataTypes, Model } from 'sequelize';

const ADMIN = "admin";
const NON_ADMIN_SCHEMA = "myschema";

async function getSequelizeConnection(): Promise<Sequelize> {

  const clusterEndpoint: string = process.env.CLUSTER_ENDPOINT!;
  if (!clusterEndpoint) {
    throw new Error("Missing required environment variable CLUSTER_ENDPOINT")
  }
  const user: string = process.env.CLUSTER_USER!;
  if (!user) {
    throw new Error("Missing required environment variable CLUSTER_USER")
  }

  return new Sequelize({
    host: clusterEndpoint,
    username: user,
    dialect: 'postgres',
    dialectModule: {
      ...pg,
      Client: AuroraDSQLClient
    },
    dialectOptions: {
      clientMinMessages: 'ignore',
    },
    define: {
      timestamps: false
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    hooks: {
      afterConnect: async (connection, config) => {
        console.log("Successfully opened connection")
        if (user !== ADMIN) {
          await (connection as any).query(`SET search_path TO ${NON_ADMIN_SCHEMA}`);
        }
      }
    },
    logging: console.log, // Set to console.log to see SQL queries
  })
}

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

async function sequelizeExample() {
  var sequelize: Sequelize = await getSequelizeConnection();
  await sequelize.authenticate();


  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('owner', { cascade: true, force: true });
  await queryInterface.dropTable('pet', { cascade: true, force: true });
  await queryInterface.dropTable('vetSpecialties', { cascade: true, force: true });
  await queryInterface.dropTable('vet', { cascade: true, force: true });
  await queryInterface.dropTable('specialty', { cascade: true, force: true });

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
    }],
    order: [
      [{ model: Specialty, as: 'Specialties' }, 'id', 'ASC']
    ]
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

  await sequelize.close();
}

async function executeSqlStatementWithRetry(instance: Sequelize, sqlStatement: string, maxRetries: number = 0): Promise<any> {
  let retries = 0;
  while (retries <= maxRetries) {
    try {
      const result = await instance.transaction(async (transaction) => {
        return await instance.query(sqlStatement, {
          transaction
        });
      });
      return result;
    } catch (error) {
      const err = error as Error;
      if (retries === maxRetries) {
        throw new Error(`Maximum retries (${maxRetries}) reached. Last error: ${err.message}`);
      }
      if (err.message.includes('OC001') || err.message.includes('OC000')) {
        console.log(`Error occurred when executing statement ${sqlStatement}, executing retry`);
        retries += 1;
      } else {
        throw err;
      }
    }
  }
}

async function retryExample() {
  var sequelize: Sequelize = await getSequelizeConnection();
  await sequelize.authenticate();

  // Create and drop the table, will retry until success is reached
  await executeSqlStatementWithRetry(sequelize, "CREATE TABLE IF NOT EXISTS abc (id UUID NOT NULL);")
  await executeSqlStatementWithRetry(sequelize, "DROP TABLE IF EXISTS abc;")

  // Run statement that will fail, it will not be retried as the error is not OC001 or OC000
  try {
    await executeSqlStatementWithRetry(sequelize, "DROP TABLE abc;")
  } catch (err: any) {
    // Expected failure
  }

  // Create and drop the table, with maximum retries of 3
  await executeSqlStatementWithRetry(sequelize, "CREATE TABLE IF NOT EXISTS abc (id UUID NOT NULL);", 3)
  await executeSqlStatementWithRetry(sequelize, "DROP TABLE IF EXISTS abc;", 3)
  await sequelize.close();
}

export async function runExamples() {
  await sequelizeExample();
  await retryExample();
}

if (require.main === module) {
  runExamples().catch(console.error);
}
