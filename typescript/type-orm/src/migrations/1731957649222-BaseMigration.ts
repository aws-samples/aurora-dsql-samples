import { MigrationInterface, QueryRunner } from "typeorm";

export class BaseMigration1731957649222 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS owner (
                                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                name VARCHAR(30) NOT NULL,
                                city VARCHAR(80) NOT NULL,
                                telephone VARCHAR(20))`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS pet (
                                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                name VARCHAR(30) NOT NULL,
                                birth_date TIMESTAMP NOT NULL,
                                owner_id UUID NULL)`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS vet_specialty (
                                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                vet_id UUID NULL,
                                specialty_name VARCHAR(80) NULL)`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS specialty (
                                name VARCHAR(80) PRIMARY KEY)`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS vet (
                                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                name VARCHAR(30) NOT NULL)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS owner`);

        await queryRunner.query(`DROP TABLE IF EXISTS pet`);

        await queryRunner.query(`DROP TABLE IF EXISTS vet_specialty`);

        await queryRunner.query(`DROP TABLE IF EXISTS specialty`);

        await queryRunner.query(`DROP TABLE IF EXISTS vet`);
    }

}
