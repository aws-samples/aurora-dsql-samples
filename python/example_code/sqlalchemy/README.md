# SQLAlchemy with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Setup the environment
3. Connect to a cluster
   1. Connection Pooling
4. Create models
5. Execute Examples
   1. SQL CRUD Examples
      1. Create All Tables
      2. Create Owner, Pet, Vet, and Specialty
      3. Read Owner, Pet, Vet, and Specialty
      4. Update Owner, Pet, and Vet
      5. Delete Owner

## Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region configured as described in the 
[AWS Tools and SDKs Shared Configuration and Credentials Reference Guide](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html).
* [Python 3.8.0 or later](https://www.python.org/) - You can verify your Python installation with `python3 -V`
* AWS Xanadu python SDK is required to run psycopg with Xanadu. Following [Xanadu user guide](https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html) for python SDK installation. [TODO: update the link here with office link when the user guide is released]

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
pip install "psycopg2-binary>=2.9"
```

## Connect to a cluster
Create a DSQL engine using SQLAlchemy
```py
import boto3
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

def create_dsql_engine():
    hostname = "abcdefghijklmnopqrst123456.c0001.us-east-1.prod.sql.axdb.aws.dev"
    region = "us-east-1"
    client = boto3.client("axdbfrontend", region_name=region)
    
    # The token expiration time is optional, and the default value 900 seconds
    password_token = client.generate_db_auth_token(hostname, "DbConnectSuperuser", region)

    # Example on how to create engine for SQLAlchemy
    url = URL.create("postgresql", username="admin", password=password_token, 
        host=hostname, database="postgres")
    engine = create_engine(url, connect_args={"sslmode": "require"})

    return engine
```

### Connection Pooling
In SQLAlchemy, [connection pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html#connection-pool-configuration) is enabled by default when the engine is created; each engine is automatically associated with a connection pool in the background. Once the connection pool is started, all the connections will have the initial set of credentials. The DSQL connection session expires after 1 hour, regardless of the token expiration time. The engine will need to create a new connection to work with DSQL. If the token is expired, the engine will not be able to create new connections to DSQL. A new engine has to be created for SQLAlchemy to pick up valid new credentials and create connections to DSQL. 

## Create models

> [!NOTE]
>
> Note that Aurora DSQL does not support SERIAL, so id is based on uuid (suggest best practice guide on this TBD: Update link)

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

## Execute Examples

> [!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)


### SQL CRUD Examples

#### 1. Create All Tables
```py
# Create the necessary tables. 
def create_all_tables(engine):
    for table in Base.metadata.tables.values():
        table.create(engine, checkfirst=True)
```

#### 2. Create Owner, Pet, Vet, and Specialty

```py
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
```

#### 3. Read Owner, Pet, Vet, and Specialty

```py
def read_data_one_to_many(session):
    # Read back data for the pet.
    pet_query = select(Pet).where(Pet.name == "Tom")
    tom = session.execute(pet_query).fetchone()[0]
    print(f"Tom ID: {tom.id}, Name: {tom.name}, Birth date: {tom.birth_date}, Owner ID: {tom.owner_id}")

    # Get the corresponding owner
    owner_query = select(Owner).where(Owner.id == tom.owner_id)
    john = session.execute(owner_query).fetchone()[0]
    print(f"John ID: {john.id}, Name: {john.name}, City: {john.city}, Telephone: {john.telephone}")

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
```

#### 4. Update Owner, Pet, and Vet
```py
def update_data_one_to_many(session):
    # Read Mary and Tom
    mary_query = select(Owner).where(Owner.name == "Mary Li")
    mary = session.execute(mary_query).fetchone()[0]
    pet_query = select(Pet).where(Pet.name == "Tom")
    tom = session.execute(pet_query).fetchone()[0]

    # Update the pet by changing the owner to mary
    update_query = update(Pet).values({"owner_id":mary.id}).where(Pet.id == tom.id)
    session.execute(update_query)

def update_data_many_to_many_add_specialty(session):
    vet_query = select(Vet).where(Vet.name == "Vince")
    vince = session.execute(vet_query).fetchone()[0]

    specialties_query = select(Specialty).where(Specialty.id == "Dogs")
    dogs = session.execute(specialties_query).fetchone()[0]

    # Update the vet by assigning Vince specialty dogs
    vince.specialties.append(dogs)
    session.commit()

def update_data_many_to_many_remove_specialty(session):
    vet_query = select(Vet).where(Vet.name == "Vince")
    vince = session.execute(vet_query).fetchone()[0]

    specialties_query = select(Specialty).where(Specialty.id == "Dogs")
    dogs = session.execute(specialties_query).fetchone()[0]

    # Remove the specialty dogs from Vince, he should have no specialty now
    vince.specialties.remove(dogs)
    session.commit()
```

#### 5. Delete Owner
```py
def delete_owner(session):
    # Delete owner
    delete_query = delete(Owner).where(Owner.name == "John Doe")
    session.execute(delete_query)
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
