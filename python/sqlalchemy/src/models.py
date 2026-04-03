# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
SQLAlchemy ORM models for the veterinary domain.

Aurora DSQL recommends UUIDs as the primary key type. Foreign key
constraints are not supported, so ForeignKey() cannot be used in column
definitions. Without ForeignKey(), SQLAlchemy cannot auto-detect join
conditions between tables. To define relationships, we use
relationship() with explicit primaryjoin and foreign() annotations.
The foreign() annotation tells SQLAlchemy which column is the
referencing side of the join, replacing the role ForeignKey() normally
plays. See: https://docs.sqlalchemy.org/en/20/orm/join_conditions.html
#creating-custom-foreign-conditions
"""

from datetime import date
from typing import List, Optional
from uuid import UUID

from sqlalchemy import Column, String, Table, Uuid, Date, text
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    foreign,
)


class Base(DeclarativeBase):
    pass


specialty_to_vet = Table(
    "specialty_to_vet",
    Base.metadata,
    Column("specialty_name", String(80), primary_key=True),
    Column("vet_id", Uuid, primary_key=True),
)


class Owner(Base):
    __tablename__ = "owner"

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(30))
    city: Mapped[str] = mapped_column(String(80))
    telephone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)


class Pet(Base):
    __tablename__ = "pet"

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(30))
    birth_date: Mapped[date] = mapped_column(Date)
    owner_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)


class Specialty(Base):
    __tablename__ = "specialty"

    name: Mapped[str] = mapped_column(String(80), primary_key=True)


class Vet(Base):
    __tablename__ = "vet"

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(30))


# Relationships defined after all classes exist, using foreign() since
# Aurora DSQL does not enforce ForeignKey constraints.
Owner.pets = relationship(
    Pet,
    primaryjoin=Owner.id == foreign(Pet.owner_id),
    back_populates="owner",
)
Pet.owner = relationship(
    Owner,
    primaryjoin=foreign(Pet.owner_id) == Owner.id,
    back_populates="pets",
)
Specialty.vets = relationship(
    Vet,
    secondary=specialty_to_vet,
    primaryjoin=Specialty.name == foreign(specialty_to_vet.c.specialty_name),
    secondaryjoin=Vet.id == foreign(specialty_to_vet.c.vet_id),
    back_populates="specialties",
)
Vet.specialties = relationship(
    Specialty,
    secondary=specialty_to_vet,
    primaryjoin=Vet.id == foreign(specialty_to_vet.c.vet_id),
    secondaryjoin=Specialty.name == foreign(specialty_to_vet.c.specialty_name),
    back_populates="vets",
)
