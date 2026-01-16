import "reflect-metadata";
import { randomUUID } from "crypto";
import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity("vet_specialty")
export class VetSpecialty {
    @PrimaryColumn({
        type: 'varchar',
        length: 36,
        generatedIdentity: "ALWAYS",
        default: "gen_random_uuid()"
    })
    id: string;

    constructor() {
        if(!this.id) {
            this.id = randomUUID();
        }
    }
}