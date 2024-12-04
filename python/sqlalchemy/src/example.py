# Copyright 2024 Amazon.com, Inc. or its affiliates.
# Licensed under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
# 
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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
import os, sys

def create_dsql_engine(hostname, region):
    client = boto3.client("dsql", region_name=region)
    
    # The token expiration time is optional, and the default value 900 seconds
    password_token = client.generate_db_connect_admin_auth_token(hostname, region)

    # Example on how to create engine for SQLAlchemy
    url = URL.create("postgresql", username="admin", password=password_token, 
        host=hostname, database="postgres")

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
    # One to many
    owner = relationship("Owner", foreign_keys=[owner_id], primaryjoin="Owner.id == Pet.owner_id")

# Define an association table for Vet and Speacialty, this is an intermediate table
# that lets us define the may-to-many mapping
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
    # Many-to-Many mapping
    specialties = relationship("Specialty", secondary=VetSpecialties.__table__,
        primaryjoin="foreign(VetSpecialties.vet_id)==Vet.id",
        secondaryjoin="foreign(VetSpecialties.specialty_id)==Specialty.id")

def main(cluster_endpoint, region):
    # Create the engine
    engine = create_dsql_engine(cluster_endpoint, region)
    
    # Create all tables    
    for table in Base.metadata.tables.values():
        table.drop(engine, checkfirst=True)
    
    # Create all tables    
    for table in Base.metadata.tables.values():
        table.create(engine, checkfirst=True)

    session = Session(engine)
    # Owner-Pet relationship is one to many.
    ## Insert owners
    john_doe = Owner(name="John Doe", city="Anytown")
    mary_major = Owner(name="Mary Major", telephone="555-555-0123", city="Anytown")

    ## Add two pets. 
    pet_1 = Pet(name="Pet-1", birth_date="2006-10-25", owner=john_doe)
    pet_2 = Pet(name="Pet-2", birth_date="2021-7-23", owner=mary_major)

    session.add_all([john_doe, mary_major, pet_1, pet_2])
    session.commit()  
 
    # Read back data for the pet.
    pet_query = select(Pet).where(Pet.name == "Pet-1")
    pet_1 = session.execute(pet_query).fetchone()[0]

    # Get the corresponding owner
    owner_query = select(Owner).where(Owner.id == pet_1.owner_id)
    john_doe = session.execute(owner_query).fetchone()[0]

    # Test: check read values
    assert pet_1.name == "Pet-1"
    assert str(pet_1.birth_date) == "2006-10-25"
    # Owner must be what we have inserted
    assert john_doe.name == "John Doe"
    assert john_doe.city == "Anytown"

    # Vet-Specialty relationship is many to many.
    dogs = Specialty(id="Dogs")
    cats = Specialty(id="Cats")

    ## Insert two vets with specialties, one vet without any specialty
    akua_mansa = Vet(name="Akua Mansa",specialties=[dogs])
    carlos_salazar = Vet(name="Carlos Salazar", specialties=[dogs, cats])

    session.add_all([dogs, cats, akua_mansa, carlos_salazar])
    session.commit()   

    # Read back data for the vets.
    vet_query = select(Vet).where(Vet.name == "Akua Mansa")
    akua_mansa = session.execute(vet_query).fetchone()[0]
    
    vet_query = select(Vet).where(Vet.name == "Carlos Salazar")
    carlos_salazar = session.execute(vet_query).fetchone()[0]
    
    # Test: check read value
    assert akua_mansa.name == "Akua Mansa"
    assert akua_mansa.specialties[0].id == "Dogs"

    assert carlos_salazar.name == "Carlos Salazar"
    assert carlos_salazar.specialties[0].id == "Cats"
    assert carlos_salazar.specialties[1].id == "Dogs"

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

if __name__ == "__main__":
    cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
    region = os.environ.get("REGION", None)
    if cluster_endpoint is None:
        sys.exit("CLUSTER_ENDPOINT environment variable is not set")
    if region is None:
        sys.exit("REGION environment variable is not set")
    example(cluster_endpoint, region)
