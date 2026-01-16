import "reflect-metadata";
import { randomUUID } from "crypto";
import { Column, Entity, PrimaryColumn, ManyToMany, JoinTable } from "typeorm";
import { Specialty } from "./Specialty";

@Entity("vet")
export class Vet {
    @PrimaryColumn({
        type: 'varchar',
        length: 36,
        generatedIdentity: "ALWAYS",
        default: "gen_random_uuid()"
    })
    id: string;

    @Column({
        length: 30,
        nullable: false
    })
    name: string;

    @ManyToMany(() => Specialty, (specialty) => specialty.vets, {
        cascade: true
    })
    @JoinTable({
        name: "vet_specialty",
        joinColumn: { 
            name: "vet_id", 
            referencedColumnName: "id"
        },
        inverseJoinColumn: { 
            name: "specialty_name",
            referencedColumnName: "name"
        }
    })
    specialties: Specialty[];

    constructor() {
        if (!this.id) {
            this.id = randomUUID();
        }
    }
}