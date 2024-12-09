import "reflect-metadata";
import { Column, Entity, PrimaryColumn, OneToMany } from "typeorm";
import { Pet } from "./Pet";
import { v4 as uuidv4 } from "uuid";

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
            this.id = uuidv4();
        }
    }
}