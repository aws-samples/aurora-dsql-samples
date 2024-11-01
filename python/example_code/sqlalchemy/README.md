# SqlAlchemy with Aurora DSQL

## Setup the environment
1. Install AWS DSQL SDK. Following (user guide)[https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html] for python SDK installation.

2. On local environment, activate python virtual environment by running:
```sh
python3 -m venv sqlalchemy_venv
source sqlalchemy_venv/bin/activate
```

3. Install required dependencies including SQLAlchemy
```sh
pip install sqlalchemy
pip install "psycopg[binary]>=3"
```

## Create a DSQL engine using SQLAlchemy
```py
import boto3
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

def create_dsql_engine():
    hostname = "abcdefghijklmnopqrst123456.c0001.us-east-1.prod.sql.axdb.aws.dev"
    region = "us-east-1"
    client = boto3.client("axdbfrontend", region_name=region)
    password_token = client.generate_db_auth_token(hostname, "DbConnectSuperuser", region)

    # Example on how to create engine for SQLAlchemy
    url = URL.create("postgresql", username="axdb_superuser", password=password_token, 
        host=hostname, database="postgres")
    engine = create_engine(url, connect_args={"sslmode": "require"})

    return engine

```

## Create models
Owner table has one-to-many relationship with Pet table.
Vet table has many-to-many relationship with Specialty table.
```py
## Dependencies for Model class
from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import relationship
from sqlalchemy import Column, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import text

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
```

## Create and Drop tables and Insert, Read, Update and Delete data
```py
def crud():
    # Create the engine
    engine = create_dsql_engine()

    # Create the necessary tables. Emit CREATE TABLE DDL
    for table in Base.metadata.tables.values():
        table.create(engine, checkfirst=True)

    session = Session(engine) 

    # Insert data
    ## Insert few owners
    joe = Owner(name="Joe", city="Seattle")
    mary = Owner(name="Mary", telephone="93209753297", city="New York")
    dennis = Owner(name="Dennis", city="Chicago")

    ## Add a pet owned by Joe
    tom = Pet(name="Tom", birth_date="2006-10-25", owner=joe)

    # Insert few specialties
    exotic = Specialty(
        id="Exotic"
    )

    dogs = Specialty(
        id="Dogs"
    )

    cats = Specialty(
        id="Cats"
    )

    ## Insert two vets with specialty, one vet without any specialty
    jake = Vet(
        name="Jake",
        specialties=[exotic]
    )

    alice = Vet(
        name="Alice",
        specialties=[dogs, cats]
    )

    vince = Vet(
        name="Vince"
    )

    session.add_all([joe, mary, dennis, tom, exotic, dogs, cats, jake, alice, vince])
    session.commit()   
    
    # one-to-many relationship example
    # Read back data for the pet.
    pet_query = select(Pet).where(Pet.name == "Tom")
    tom = session.execute(pet_query).fetchone()[0]
    # Get the corresponding owner
    owner_query = select(Owner).where(Owner.id == tom.owner_id)
    joe = session.execute(owner_query).fetchone()[0]
    
    assert tom.name == "Tom"
    assert str(tom.birth_date) == "2006-10-25"
    # Owner must be what we have inserted
    assert joe.name == "Joe"
    assert joe.city == "Seattle"
    
    # Update the pet by changing the owner to mary
    update_query = update(Pet).values({"owner_id":mary.id}).where(Pet.id == tom.id)
    session.execute(update_query)
    # Check our update
    pet_query = select(Pet).where(Pet.name == "Tom")
    tom = session.execute(pet_query).fetchone()[0]
    assert tom.owner_id == mary.id
    
    # Delete an owner
    delete_query = delete(Owner).where(Owner.name == "Dennis")
    session.execute(delete_query)
    # Check that owner is deleted
    owner_query = select(Owner).where(Owner.name == "Dennis")
    owners = session.execute(owner_query).fetchall()
    assert len(owners) == 0

    # many to many relationship example
    # Read back data for the vets.
    vet_query = select(Vet).where(Vet.name == "Jake")
    jake = session.execute(vet_query).fetchone()[0]
    
    vet_query = select(Vet).where(Vet.name == "Alice")
    alice = session.execute(vet_query).fetchone()[0]

    vet_query = select(Vet).where(Vet.name == "Vince")
    vince = session.execute(vet_query).fetchone()[0]

    # Get the corresponding specialties for Jake and Alice 
    specialties_query = select(Specialty).where(Specialty.id == jake.specialties[0].id)
    exotic = session.execute(specialties_query).fetchone()[0]
    # Child objects are ordered alphabetically, so cats will come before dogs
    specialties_query = select(Specialty).where(Specialty.id == alice.specialties[0].id)
    cats = session.execute(specialties_query).fetchone()[0]
    specialties_query = select(Specialty).where(Specialty.id == alice.specialties[1].id)
    dogs = session.execute(specialties_query).fetchone()[0]

    assert jake.name == "Jake"
    assert exotic.id == "Exotic"

    assert alice.name == "Alice"
    assert dogs.id == "Dogs"
    assert cats.id == "Cats"

    assert vince.name == "Vince"
    assert vince.specialties == []

    # Update the vet by assigning Vince specialty dogs
    vince.specialties.append(dogs)
    session.commit()
    # Check our update
    specialties_query = select(Specialty).where(Specialty.id == vince.specialties[0].id)
    dogs = session.execute(specialties_query).fetchone()[0]
    assert dogs.id == "Dogs"

    # Remove the specialty dogs from Vince, he should have no specialty now
    vince.specialties.remove(dogs)
    session.commit()
    # Check our update
    vince = session.execute(vet_query).fetchone()[0]
    assert vince.specialties == []

    # Drop all tables
    for table in Base.metadata.tables.values():
        table.drop(engine, checkfirst=True)
```

## Automate primary key generation
Use UUID to auto-generate primary key on the server-side
```py
class Owner(Base):
    __tablename__ = "owner"
    
    id = Column(
                "id", UUID, primary_key=True, default=text('gen_random_uuid()')
            )

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
