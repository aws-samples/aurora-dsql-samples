# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
CRUD operations demonstrating SQLAlchemy ORM with Aurora DSQL.
"""

from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from src.dsql_engine import create_dsql_engine
from src.models import Base, Owner, Pet, Specialty, Vet, specialty_to_vet

PET_1_BIRTH_DATE = date(2006, 10, 25)
PET_2_BIRTH_DATE = date(2021, 7, 23)


def run_example():
    print("Starting SQLAlchemy DSQL Example...")
    engine = create_dsql_engine()

    try:
        print("Dropping existing tables (if any)...")
        with engine.connect() as conn:
            Base.metadata.drop_all(conn)
            conn.commit()

        print("Creating tables...")
        with engine.connect() as conn:
            Base.metadata.create_all(conn)
            conn.commit()

        with Session(engine) as session:
            populate(session)
            verify_pets(session)
            verify_owners(session)
            verify_vets(session)
            cleanup(session)
            print("Example completed successfully!")

        print("Dropping tables...")
        with engine.connect() as conn:
            Base.metadata.drop_all(conn)
            conn.commit()
    except Exception as e:
        print(f"Error: {e}")
        raise
    finally:
        engine.dispose()


def populate(session: Session):
    print("Creating owners...")
    john = Owner(name="John Doe", city="New York")
    mary = Owner(name="Mary Major", city="Anytown", telephone="555-555-0123")
    session.add_all([john, mary])
    session.flush()
    print(f"Created owner: {john.name} (ID: {john.id})")
    print(f"Created owner: {mary.name} (ID: {mary.id})")

    print("Creating pets...")
    pet1 = Pet(name="Pet1", birth_date=PET_1_BIRTH_DATE, owner_id=john.id)
    pet2 = Pet(name="Pet2", birth_date=PET_2_BIRTH_DATE, owner_id=john.id)
    session.add_all([pet1, pet2])
    session.flush()
    print(f"Created pet: {pet1.name} (Owner: {john.name})")
    print(f"Created pet: {pet2.name} (Owner: {john.name})")

    print("Creating veterinary specialties...")
    exotic = Specialty(name="Exotic")
    dogs = Specialty(name="Dogs")
    cats = Specialty(name="Cats")
    session.add_all([exotic, dogs, cats])
    session.flush()
    print("Created specialties: Exotic, Dogs, Cats")

    print("Creating veterinarians...")
    akua = Vet(name="Akua Mansa", specialties=[exotic])
    carlos = Vet(name="Carlos Salazar", specialties=[cats, dogs])
    session.add_all([akua, carlos])
    session.commit()
    print(f"Created vet: {akua.name} (Specialty: Exotic)")
    print(f"Created vet: {carlos.name} (Specialties: Cats, Dogs)")


def verify_pets(session: Session):
    print("Querying pet information...")
    pet1 = session.execute(
        select(Pet).options(joinedload(Pet.owner)).where(Pet.name == "Pet1")
    ).unique().scalar_one()
    assert pet1.name == "Pet1"
    assert pet1.birth_date == PET_1_BIRTH_DATE
    assert pet1.owner.name == "John Doe"

    pet2 = session.execute(
        select(Pet).options(joinedload(Pet.owner)).where(Pet.name == "Pet2")
    ).unique().scalar_one()
    assert pet2.name == "Pet2"
    assert pet2.birth_date == PET_2_BIRTH_DATE
    assert pet2.owner.name == "John Doe"


def verify_owners(session: Session):
    print("Querying owner information...")
    john = session.execute(
        select(Owner).options(joinedload(Owner.pets)).where(Owner.name == "John Doe")
    ).unique().scalar_one()
    assert john.city == "New York"
    assert john.telephone is None
    assert len(john.pets) == 2

    mary = session.execute(
        select(Owner).options(joinedload(Owner.pets)).where(Owner.name == "Mary Major")
    ).unique().scalar_one()
    assert mary.city == "Anytown"
    assert mary.telephone == "555-555-0123"
    assert len(mary.pets) == 0


def verify_vets(session: Session):
    print("Querying veterinarians with specialties...")
    akua = session.execute(
        select(Vet).options(joinedload(Vet.specialties)).where(Vet.name == "Akua Mansa")
    ).unique().scalar_one()
    akua_specs = sorted([s.name for s in akua.specialties])
    assert len(akua_specs) == 1
    assert akua_specs[0] == "Exotic"

    carlos = session.execute(
        select(Vet)
        .options(joinedload(Vet.specialties))
        .where(Vet.name == "Carlos Salazar")
    ).unique().scalar_one()
    carlos_specs = sorted([s.name for s in carlos.specialties])
    assert len(carlos_specs) == 2
    assert carlos_specs[0] == "Cats"
    assert carlos_specs[1] == "Dogs"


def cleanup(session: Session):
    print("Cleaning up...")
    session.execute(delete(Pet))
    session.execute(specialty_to_vet.delete())
    session.execute(delete(Owner))
    session.execute(delete(Specialty))
    session.execute(delete(Vet))
    session.commit()
    print("Cleanup complete.")


if __name__ == "__main__":
    run_example()
