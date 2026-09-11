ALTER TABLE "pet"
	ADD CONSTRAINT "pet_owner_id_owner_id_fk"
	FOREIGN KEY ("owner_id") REFERENCES "owner"("id")
	ON DELETE RESTRICT ON UPDATE RESTRICT
	NOT VALID;
--> statement-breakpoint
ALTER TABLE "specialty_to_vet"
	ADD CONSTRAINT "specialty_to_vet_specialty_name_specialty_name_fk"
	FOREIGN KEY ("specialty_name") REFERENCES "specialty"("name")
	ON DELETE RESTRICT ON UPDATE RESTRICT
	NOT VALID;
--> statement-breakpoint
ALTER TABLE "specialty_to_vet"
	ADD CONSTRAINT "specialty_to_vet_vet_id_vet_id_fk"
	FOREIGN KEY ("vet_id") REFERENCES "vet"("id")
	ON DELETE RESTRICT ON UPDATE RESTRICT
	NOT VALID;
--> statement-breakpoint
ALTER TABLE ASYNC "pet"
	VALIDATE CONSTRAINT "pet_owner_id_owner_id_fk";
--> statement-breakpoint
ALTER TABLE ASYNC "specialty_to_vet"
	VALIDATE CONSTRAINT "specialty_to_vet_specialty_name_specialty_name_fk";
--> statement-breakpoint
ALTER TABLE ASYNC "specialty_to_vet"
	VALIDATE CONSTRAINT "specialty_to_vet_vet_id_vet_id_fk";
