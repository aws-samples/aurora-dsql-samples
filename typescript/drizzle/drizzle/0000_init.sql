CREATE TABLE "owner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(30) NOT NULL,
	"city" varchar(80) NOT NULL,
	"telephone" varchar(20)
);
--> statement-breakpoint
CREATE TABLE "pet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(30) NOT NULL,
	"birth_date" date NOT NULL,
	"owner_id" uuid
);
--> statement-breakpoint
CREATE TABLE "specialty" (
	"name" varchar(80) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialty_to_vet" (
	"specialty_name" varchar(80) NOT NULL,
	"vet_id" uuid NOT NULL,
	CONSTRAINT "specialty_to_vet_specialty_name_vet_id_pk" PRIMARY KEY("specialty_name","vet_id")
);
--> statement-breakpoint
CREATE TABLE "vet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE INDEX ASYNC "pet_owner_id_idx" ON "pet"("owner_id");
