import "reflect-metadata";
import { Entity, Column, PrimaryColumn } from "typeorm";
import { v4 as uuidv4 } from "uuid";

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
            this.id = uuidv4();
        }
    }
}