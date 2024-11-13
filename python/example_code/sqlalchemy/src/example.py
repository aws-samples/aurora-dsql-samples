'''
Copyright 2024 Amazon.com, Inc. or its affiliates.
Licensed under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
'''

## Dependencies for engine creation
from sqlalchemy import create_engine, select, update, delete
from sqlalchemy.engine import URL

## Dependencies for token generation
import boto3

## Dependencies for Model class
from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import relationship
from sqlalchemy import Column, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import text

## Dependencies for object creation (inserts)
from sqlalchemy.orm import Session

## Dependencies for retry statement
from sqlalchemy.sql import text
from sqlalchemy.exc import SQLAlchemyError

def create_dsql_engine():
    hostname = "pmabtthm3cbd3jdh7bisyygs34.c0001.us-east-1.prod.sql.axdb.aws.dev"
    region = "us-east-1"
    client = boto3.client("axdbfrontend", region_name=region)
    
    # The token expiration time is optional, and the default value 900 seconds
    password_token = client.generate_db_auth_token(hostname, "DbConnectSuperuser", region)

    # Example on how to create engine for SQLAlchemy
    url = URL.create("postgresql", username="admin", password=password_token, 
        host=hostname, database="postgres", 
        query={"options": "-c axdb_opts=version=0.1  -c axdb_opts=pooler=true"})
    # TODO remove pooler option in sample code.
    # https://taskei.amazon.dev/tasks/P164113257

    engine = create_engine(url, connect_args={"sslmode": "require"})

    return engine

class Base(DeclarativeBase):
    pass

# Define a Owner table
class Owner(Base):
    __tablename__ = "owner"
    
    id = Column(
                "id", UUID, primary_key=True, default=text('gen_random_uuid()')
            )
    name = Column("name", String(30), nullable=False)
    city = Column("city", String(80), nullable=False)
    telephone = Column("telephone", String(20), nullable=True, default=None)

# Define a Pet table
class Pet(Base):
    __tablename__ = "pet"
    
    id = Column(
                "id", UUID, primary_key=True, default=text('gen_random_uuid()')
            )
    name = Column("name", String(30), nullable=False)
    birth_date = Column("birth_date", Date(), nullable=False)
    owner_id = Column(
                "owner_id", UUID, nullable=True
    )
    owner = relationship("Owner", foreign_keys=[owner_id], primaryjoin="Owner.id == Pet.owner_id")

# Define an association table for Vet and Speacialty
class VetSpecialties(Base):
    __tablename__ = "vetSpecialties"
    
    id = Column(
                "id", UUID, primary_key=True, default=text('gen_random_uuid()')
            )
    vet_id = Column(
                "vet_id", UUID, nullable=True
    )
    specialty_id = Column(
                "specialty_id", String(80), nullable=True
    )

# Define a Specialty table
class Specialty(Base):
    __tablename__ = "specialty"
    id = Column(
                "name", String(80), primary_key=True
            )
    
# Define a Vet table
class Vet(Base):
    __tablename__ = "vet"
    
    id = Column(
                "id", UUID, primary_key=True, default=text('gen_random_uuid()')
            )
    name = Column("name", String(30), nullable=False)
    specialties = relationship("Specialty", secondary=VetSpecialties.__table__,
        primaryjoin="foreign(VetSpecialties.vet_id)==Vet.id",
        secondaryjoin="foreign(VetSpecialties.specialty_id)==Specialty.id")

# Create the necessary tables. 
def create_all_tables(engine):
    for table in Base.metadata.tables.values():
        table.create(engine, checkfirst=True)

def create_data_one_to_many(session):
    # Owner-Pet relationship is one to many.
    ## Insert owners
    john = Owner(name="John Doe", city="Seattle")
    mary = Owner(name="Mary Li", telephone="93209753297", city="New York")

    ## Add two pets owned by John. 
    tom = Pet(name="Tom", birth_date="2006-10-25", owner=john)
    emerald = Pet(name="Emerald", birth_date="2021-7-23", owner=john)

    session.add_all([john, mary, tom, emerald])
    session.commit()   

def read_data_one_to_many(session):
    # Read back data for the pet.
    pet_query = select(Pet).where(Pet.name == "Tom")
    tom = session.execute(pet_query).fetchone()[0]
    print(f"Tom ID: {tom.id}, Name: {tom.name}, Birth date: {tom.birth_date}, Owner ID: {tom.owner_id}")

    # Get the corresponding owner
    owner_query = select(Owner).where(Owner.id == tom.owner_id)
    john = session.execute(owner_query).fetchone()[0]
    print(f"John ID: {john.id}, Name: {john.name}, City: {john.city}, Telephone: {john.telephone}")

    # Test: check read values
    assert tom.name == "Tom"
    assert str(tom.birth_date) == "2006-10-25"
    # Owner must be what we have inserted
    assert john.name == "John Doe"
    assert john.city == "Seattle"

def update_data_one_to_many(session):
    # Read Mary and Tom
    mary_query = select(Owner).where(Owner.name == "Mary Li")
    mary = session.execute(mary_query).fetchone()[0]
    pet_query = select(Pet).where(Pet.name == "Tom")
    tom = session.execute(pet_query).fetchone()[0]

    # Update the pet by changing the owner to mary
    update_query = update(Pet).values({"owner_id":mary.id}).where(Pet.id == tom.id)
    session.execute(update_query)

    # Test: check updated value
    pet_query = select(Pet).where(Pet.name == "Tom")
    tom = session.execute(pet_query).fetchone()[0]
    assert tom.owner_id == mary.id

def delete_owner(session):
    # Delete an owner
    delete_query = delete(Owner).where(Owner.name == "John Doe")
    session.execute(delete_query)

    # Test: Check that owner is deleted
    owner_query = select(Owner).where(Owner.name == "John Doe")
    owners = session.execute(owner_query).fetchall()
    assert len(owners) == 0

def create_data_many_to_many(session):
    # Vet-Specialty relationship is one to many.
    exotic = Specialty(id="Exotic")
    dogs = Specialty(id="Dogs")
    cats = Specialty(id="Cats")

    ## Insert two vets with specialties, one vet without any specialty
    jake = Vet(name="Jake",specialties=[exotic])
    alice = Vet(name="Alice", specialties=[dogs, cats])
    vince = Vet(name="Vince")

    session.add_all([exotic, dogs, cats, jake, alice, vince])
    session.commit()   

def read_data_many_to_many(session):
    # Read back data for the vets.
    vet_query = select(Vet).where(Vet.name == "Jake")
    jake = session.execute(vet_query).fetchone()[0]
    
    vet_query = select(Vet).where(Vet.name == "Alice")
    alice = session.execute(vet_query).fetchone()[0]

    vet_query = select(Vet).where(Vet.name == "Vince")
    vince = session.execute(vet_query).fetchone()[0]

    print(f"Jake ID: {jake.id}, Name: {jake.name}, Specialties: {jake.specialties}")
    print(f"Alice ID: {alice.id}, Name: {alice.name}, Specialties: {alice.specialties}")
    print(f"Vince ID: {vince.id}, Name: {vince.name}, Specialties: {vince.specialties}")

    # Get the corresponding specialties for Jake and Alice 
    specialties_query = select(Specialty).where(Specialty.id == jake.specialties[0].id)
    exotic = session.execute(specialties_query).fetchone()[0]
    print(f"Exotic ID: {exotic.id}")

    # Child objects are ordered alphabetically, so cats will come before dogs
    specialties_query = select(Specialty).where(Specialty.id == alice.specialties[0].id)
    cats = session.execute(specialties_query).fetchone()[0]
    print(f"Cats ID: {cats.id}")

    specialties_query = select(Specialty).where(Specialty.id == alice.specialties[1].id)
    dogs = session.execute(specialties_query).fetchone()[0]
    print(f"Dogs ID: {dogs.id}")

    # Test: check read value
    assert jake.name == "Jake"
    assert exotic.id == "Exotic"

    assert alice.name == "Alice"
    assert dogs.id == "Dogs"
    assert cats.id == "Cats"

    assert vince.name == "Vince"
    assert vince.specialties == []

def update_data_many_to_many_add_specialty(session):
    vet_query = select(Vet).where(Vet.name == "Vince")
    vince = session.execute(vet_query).fetchone()[0]

    specialties_query = select(Specialty).where(Specialty.id == "Dogs")
    dogs = session.execute(specialties_query).fetchone()[0]

    # Update the vet by assigning Vince specialty dogs
    vince.specialties.append(dogs)
    session.commit()

    # Test: Check updated value
    specialties_query = select(Specialty).where(Specialty.id == vince.specialties[0].id)
    dogs = session.execute(specialties_query).fetchone()[0]
    assert dogs.id == "Dogs"

def update_data_many_to_many_remove_specialty(session):
    vet_query = select(Vet).where(Vet.name == "Vince")
    vince = session.execute(vet_query).fetchone()[0]

    specialties_query = select(Specialty).where(Specialty.id == "Dogs")
    dogs = session.execute(specialties_query).fetchone()[0]

    # Remove the specialty dogs from Vince, he should have no specialty now
    vince.specialties.remove(dogs)
    session.commit()

    # Test: Check updated value
    vince = session.execute(vet_query).fetchone()[0]
    assert vince.specialties == []

def crud():
    # Create the engine
    engine = create_dsql_engine()
    
    create_all_tables(engine)

    session = Session(engine) 

    create_data_one_to_many(session)

    create_data_many_to_many(session)

    read_data_one_to_many(session)
    
    update_data_one_to_many(session)

    delete_owner(session)

    read_data_many_to_many(session)

    update_data_many_to_many_add_specialty(session)

    update_data_many_to_many_remove_specialty(session)

    # Drop all tables
    for table in Base.metadata.tables.values():
        table.drop(engine, checkfirst=True)

# Execute SQL Statement with retry
def exeucte_sql_statement_retry(engine, sql_statement, max_retries=None):
    with engine.connect() as connection:
        while max_retries == None or max_retries > 0:
            try:
                connection.execute(text(sql_statement))
                connection.commit()
                break
            except SQLAlchemyError as e:
                print(f"Error: {e}")
                error = str(e.orig)
                if not("OC001" in error or "OC000" in error):
                    print("Error occurred is not OC001 or OC000 error. Stop retries.")
                    break
                print(f"Error occurred when executing statement {sql_statement}, executing retry")
                if max_retries != None:
                    max_retries -= 1

def run_retry():
    # Create the engine
    engine = create_dsql_engine()

    table_name = "abc"

    # Create and drop the table, will retry until success is reached
    exeucte_sql_statement_retry(engine, "CREATE TABLE IF NOT EXISTS abc (id UUID NOT NULL);")
    exeucte_sql_statement_retry(engine, "DROP TABLE IF EXISTS abc;")

    # Run statement that will fail, it will not be retried as the error is not OC001 or OC000
    exeucte_sql_statement_retry(engine, "DROP TABLE abc;")

    # Create and drop the table, with maximum retries of 3
    exeucte_sql_statement_retry(engine, "CREATE TABLE IF NOT EXISTS abc (id UUID NOT NULL);", 3)
    exeucte_sql_statement_retry(engine, "DROP TABLE IF EXISTS abc;", 3)

if __name__ == "__main__":
    crud()
    run_retry()
