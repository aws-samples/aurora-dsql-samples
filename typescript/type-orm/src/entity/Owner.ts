import "reflect-metadata";
import { randomUUID } from "crypto";
import { Column, Entity, PrimaryColumn, OneToMany } from "typeorm";
import { Pet } from "./Pet";

@Entity("owner")
export class Owner {
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

    @Column({
        length: 80,
        nullable: false
    })
    city: string;

    @Column({
        length: 20,
        nullable: true
    })
    telephone: string;

    @OneToMany(() => Pet, (pet: Pet) => pet.owner, {
        cascade: true
    })
    pets: Pet[];

    constructor() {
        if(!this.id) {
            this.id = randomUUID();
        }
    }
}