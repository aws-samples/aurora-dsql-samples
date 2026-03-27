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
	"birthDate" date NOT NULL,
	"owner_id" uuid
);
--> statement-breakpoint
CREATE TABLE "specialty" (
	"name" varchar(80) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_SpecialtyToVet" (
	"A" varchar(80) NOT NULL,
	"B" uuid NOT NULL,
	CONSTRAINT "_SpecialtyToVet_A_B_pk" PRIMARY KEY("A","B")
);
--> statement-breakpoint
CREATE TABLE "vet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(30) NOT NULL
);
