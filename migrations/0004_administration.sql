CREATE TABLE "admin_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_password_links" (
	"admin_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_password_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_auth_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_password_links" ADD CONSTRAINT "admin_password_links_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expiry_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_auth_limits_expiry_idx" ON "admin_auth_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_activity_logs_created_idx" ON "admin_activity_logs" USING btree ("created_at","id");
--> statement-breakpoint
INSERT INTO "permissions" ("key", "description") VALUES
  ('admins.manage', 'Manage administrator accounts and role assignments'),
  ('audit.read', 'View the administrative audit log'),
  ('settings.manage', 'Manage public station settings')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
  ('super-admin', 'admins.manage'),
  ('super-admin', 'audit.read'),
  ('super-admin', 'settings.manage'),
  ('administrator', 'audit.read'),
  ('administrator', 'settings.manage')
ON CONFLICT ("role_key", "permission_key") DO NOTHING;
