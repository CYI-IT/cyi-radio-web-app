CREATE TABLE "phase0_probe_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"marker" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
