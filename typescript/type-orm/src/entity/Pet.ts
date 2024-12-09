import "reflect-metadata";
import { Column, Entity, ManyToOne, PrimaryColumn, JoinColumn, RelationId } from "typeorm";
import { Owner } from "./Owner";
import { v4 as uuidv4 } from "uuid";

@Entity("pet")
export class Pet {
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
        name: "birth_date",
        nullable: false
    })
    birthDate: Date;

    @ManyToOne(() => Owner, (owner: Owner) => owner.pets, {
        onDelete: "CASCADE",
    })
    @JoinColumn({
        name: "owner_id",
        referencedColumnName: "id"
    })
    owner: Owner;

    constructor() {
        if (!this.id) {
            this.id = uuidv4();
        }
    }
}