# SQLAlchemy with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Setup the environment
3. Connect to a cluster
   1. Connection Pooling
   2. SQLAlchemy With psycopg3 Is Not Supported
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
* Aurora DSQL python SDK is required to run psycopg with DSQL. Following [Aurora DSQL user guide](https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html) for python SDK installation. [TODO: update the link here with office link when the user guide is released]

## Setup the environment
1. Install Aurora DSQL SDK. Following (user guide)[https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html] for python SDK installation.

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
    # Please replace with your own cluster endpoint
    hostname = "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
    region = "us-east-1"
    client = boto3.client("dsql", region_name=region)
    
    # The token expiration time is optional, and the default value 900 seconds
    # If you are not using admin user, use generate_db_connect_auth_token instead 
    password_token = client.generate_db_connect_admin_auth_token(hostname, region)

    # Example on how to create engine for SQLAlchemy
    url = URL.create("postgresql", username="admin", password=password_token, 
        host=hostname, database="postgres")
    engine = create_engine(url, connect_args={"sslmode": "verify-full", "sslrootcert": "system"})

    return engine
```

### Connection Pooling
In SQLAlchemy, [connection pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html#connection-pool-configuration) is enabled by default when the engine is created; each engine is automatically associated with a connection pool in the background. Once the connection pool is started, all the connections will have the initial set of credentials. The Aurora DSQL connection session expires after 1 hour, regardless of the token expiration time. The engine will need to create a new connection to work with Aurora DSQL. If the token is expired, the engine will not be able to create new connections to Aurora DSQL. A new engine has to be created for SQLAlchemy to pick up valid new credentials and create connections to Aurora DSQL. 

### SQLAlchemy With psycopg3 Is Not Supported
SQLAlchemy working with psycopg3 could not work with Aurora DSQL due to `savepoint` not supported by Aurora DSQL. 

## Create models

> [!NOTE]
>
> Note that Aurora DSQL does not support SERIAL, so id is based on uuid (suggest best practice guide on this TBD: Update link)

Owner table has one-to-many relationship with Pet table.
Vet table has many-to-many relationship with Specialty table.
```py
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
# that lets us define the many-to-many mapping
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
```

## Execute Examples

> [!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)


### Example showing interactions with Aurora DSQL

```py
def example():
    # Create the engine
    engine = create_dsql_engine()
    
    # Drop all tables
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
        
if __name__ == "__main__":
    example()
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
