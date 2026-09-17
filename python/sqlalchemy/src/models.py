# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
SQLAlchemy ORM models for the veterinary domain.

Aurora DSQL recommends UUIDs as the primary key type. Foreign keys are
defined inline with CREATE TABLE and use RESTRICT actions.
"""

from datetime import date
from typing import List, Optional
from uuid import UUID

from sqlalchemy import Column, Date, ForeignKey, String, Table, Uuid, text
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    pass


specialty_to_vet = Table(
    "specialty_to_vet",
    Base.metadata,
    Column(
        "specialty_name",
        String(80),
        ForeignKey("specialty.name", ondelete="RESTRICT", onupdate="RESTRICT"),
        primary_key=True,
    ),
    Column(
        "vet_id",
        Uuid,
        ForeignKey("vet.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        primary_key=True,
    ),
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
    owner_id: Mapped[Optional[UUID]] = mapped_column(
        Uuid,
        ForeignKey("owner.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        nullable=True,
    )


class Specialty(Base):
    __tablename__ = "specialty"

    name: Mapped[str] = mapped_column(String(80), primary_key=True)


class Vet(Base):
    __tablename__ = "vet"

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(30))


# Relationships are inferred from the database foreign keys.
Owner.pets = relationship(
    Pet,
    back_populates="owner",
)
Pet.owner = relationship(
    Owner,
    back_populates="pets",
)
Specialty.vets = relationship(
    Vet,
    secondary=specialty_to_vet,
    back_populates="specialties",
)
Vet.specialties = relationship(
    Specialty,
    secondary=specialty_to_vet,
    back_populates="vets",
)
