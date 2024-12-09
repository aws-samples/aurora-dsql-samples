import "reflect-metadata"
import { Entity, PrimaryColumn, ManyToMany } from "typeorm"
import { Vet } from "./Vet";

@Entity("specialty")
export class Specialty {
    @PrimaryColumn({
        type: "varchar",
        length: 80
    })
    name: string;

    @ManyToMany(() => Vet, (vet) => vet.specialties)
    vets: Vet[];
}