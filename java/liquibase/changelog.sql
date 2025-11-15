--liquibase formatted sql

--changeset developer:1
--Put DDL statements in separate tables
CREATE TABLE IF NOT EXISTS owner
(
    "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name"      VARCHAR(30) NOT NULL,
    "city"      VARCHAR(80) NOT NULL,
    "telephone" VARCHAR(20)
);
--rollback DROP TABLE owner;

--changeset developer:2 runInTransaction:false
--Can also put multiple DDL by setting runInTransaction:false
CREATE TABLE IF NOT EXISTS pet
(
    "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name"      VARCHAR(30) NOT NULL,
    "birthDate" DATE        NOT NULL,
    "ownerId"   UUID
);

CREATE TABLE IF NOT EXISTS specialty
(
    "name" VARCHAR(80) PRIMARY KEY
);
--rollback DROP TABLE pet; DROP TABLE specialty;


--changeset developer:3
CREATE TABLE IF NOT EXISTS vet
(
    "id"   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(30) NOT NULL
);
--rollback DROP TABLE vet;

--changeset developer:4
CREATE TABLE IF NOT EXISTS specialtyToVet
(
    "specialty" VARCHAR(80) NOT NULL,
    "vet"       UUID NOT NULL,

    CONSTRAINT "_SpecialtyToVet_AB_pkey" PRIMARY KEY ("specialty", "vet")
);
--rollback DROP TABLE specialtyToVet;

--changeset developer:5 runInTransaction:false
CREATE INDEX ASYNC pet_owner_city_idx ON owner("city");
CREATE INDEX ASYNC specialtyToVet_index ON specialtyToVet("vet");
--rollback DROP INDEX pet_owner_city_idx; DROP INDEX specialtyToVet_index;

--changeset developer:6
INSERT INTO owner (name, city, telephone) VALUES ('John Doe', 'New York', NULL);
INSERT INTO owner (name, city, telephone) VALUES ('Mary Major', 'Anytown', '555-555-0123');

INSERT INTO specialty (name) VALUES ('Exotic');
INSERT INTO specialty (name) VALUES ('Dogs');
INSERT INTO specialty (name) VALUES ('Cats');

INSERT INTO vet (name) VALUES ('Akua Mansa');
INSERT INTO vet (name) VALUES ('Carlos Salazar');

INSERT INTO pet (name, "birthDate", "ownerId") VALUES ('Pet1', '2006-10-25', (SELECT id FROM owner WHERE name = 'John Doe'));
INSERT INTO pet (name, "birthDate", "ownerId") VALUES ('Pet2', '2021-07-23', (SELECT id FROM owner WHERE name = 'John Doe'));

INSERT INTO specialtyToVet (specialty, vet) VALUES ((SELECT name FROM specialty WHERE name = 'Exotic'), (SELECT id FROM vet WHERE name = 'Akua Mansa'));
INSERT INTO specialtyToVet (specialty, vet) VALUES ((SELECT name FROM specialty WHERE name = 'Cats'), (SELECT id FROM vet WHERE name = 'Carlos Salazar'));
INSERT INTO specialtyToVet (specialty, vet) VALUES ((SELECT name FROM specialty WHERE name = 'Dogs'), (SELECT id FROM vet WHERE name = 'Carlos Salazar'));

--rollback DELETE FROM specialtyToVet; DELETE FROM pet; DELETE FROM vet; DELETE FROM specialty; DELETE FROM owner;
