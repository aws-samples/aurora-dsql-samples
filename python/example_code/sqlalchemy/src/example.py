## Dependencies for engine creation
from sqlalchemy import create_engine, select, update, delete
from sqlalchemy.engine import URL

## Dependencies for token generation
import boto3

## Dependencies for Model class
import uuid
from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import relationship
from sqlalchemy import Column, Date
from sqlalchemy.dialects.postgresql import UUID

## Dependencies for object creation (inserts)
from sqlalchemy.orm import Session

def create_dsql_engine():
    hostname = "yeabtpeveodnurcrcvnf6iobba.c0001.us-east-1.prod.sql.axdb.aws.dev"
    region = "us-east-1"
    client = boto3.client("axdbfrontend", region_name=region)
    password_token = client.generate_db_auth_token(hostname, "DbConnectSuperuser", region)

    # Example on how to create engine for SQLAlchemy
    url = URL.create("postgresql", username="axdb_superuser", password=password_token, 
        host=hostname, database="postgres")
    engine = create_engine(url, connect_args={"sslmode": "require"})

    return engine

class Base(DeclarativeBase):
    pass

# Define a Owner table
class Owner(Base):
    __tablename__ = "owner"
    
    id = Column(
                "id", UUID, primary_key=True, default=uuid.uuid4
            )
    name = Column("name", String(30), nullable=False)
    city = Column("city", String(80), nullable=False)
    telephone = Column("telephone", String(20), nullable=True, default=None)

# Define a pet table
class Pet(Base):
    __tablename__ = "pet"
    
    id = Column(
                "id", UUID, primary_key=True, default=uuid.uuid4
            )
    name = Column("name", String(30), nullable=False)
    birth_date = Column("birth_date", Date(), nullable=False)
    owner_id = Column(
                "owner_id", UUID, nullable=True
    )
    owner = relationship("Owner", foreign_keys=[owner_id], primaryjoin="Owner.id == Pet.owner_id")


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
    
    session.add_all([joe, mary, dennis, tom])
    session.commit()   
    
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
    
    # Drop all tables
    for table in Base.metadata.tables.values():
        table.drop(engine, checkfirst=True)

if __name__ == "__main__":
    crud()
