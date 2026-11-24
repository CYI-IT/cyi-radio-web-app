CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email"),
	CONSTRAINT "admins_email_normalized" CHECK ("admins"."email" <> '' AND "admins"."email" = lower(btrim("admins"."email")))
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"admin_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_admin_id_role_key_pk" PRIMARY KEY("admin_id","role_key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_key" text NOT NULL,
	"permission_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_key_permission_key_pk" PRIMARY KEY("role_key","permission_key")
);
--> statement-breakpoint
CREATE TABLE "presenters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"image_path" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presenters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "programmes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_path" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programmes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "schedule_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"programme_id" uuid NOT NULL,
	"presenter_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"publication_status" text DEFAULT 'draft' NOT NULL,
	"starts_on" date NOT NULL,
	"start_time" time(0) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"weekdays" integer,
	"ends_on" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_series_kind" CHECK (
    ("schedule_series"."kind" = 'one-time' AND "schedule_series"."weekdays" IS NULL AND "schedule_series"."ends_on" IS NULL)
    OR ("schedule_series"."kind" = 'weekly' AND "schedule_series"."weekdays" IS NOT NULL AND "schedule_series"."weekdays" BETWEEN 1 AND 127
      AND ("schedule_series"."ends_on" IS NULL OR "schedule_series"."ends_on" >= "schedule_series"."starts_on"))
  ),
	CONSTRAINT "schedule_series_publication_status" CHECK ("schedule_series"."publication_status" IN ('draft', 'published')),
	CONSTRAINT "schedule_series_duration_positive" CHECK ("schedule_series"."duration_minutes" > 0),
	CONSTRAINT "schedule_series_start_time" CHECK ("schedule_series"."start_time" < TIME '24:00')
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"series_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"action" text NOT NULL,
	"starts_on" date,
	"start_time" time(0),
	"duration_minutes" integer,
	"presenter_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_exceptions_series_id_occurrence_date_pk" PRIMARY KEY("series_id","occurrence_date"),
	CONSTRAINT "schedule_exceptions_action" CHECK (
    ("schedule_exceptions"."action" = 'cancel' AND num_nonnulls("schedule_exceptions"."starts_on", "schedule_exceptions"."start_time", "schedule_exceptions"."duration_minutes", "schedule_exceptions"."presenter_id") = 0)
    OR ("schedule_exceptions"."action" = 'override' AND num_nonnulls("schedule_exceptions"."starts_on", "schedule_exceptions"."start_time", "schedule_exceptions"."duration_minutes", "schedule_exceptions"."presenter_id") > 0)
  ),
	CONSTRAINT "schedule_exceptions_duration_positive" CHECK ("schedule_exceptions"."duration_minutes" > 0),
	CONSTRAINT "schedule_exceptions_start_time" CHECK ("schedule_exceptions"."start_time" < TIME '24:00')
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_sessions_display_name_present" CHECK (btrim("chat_sessions"."display_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "chat_messages_body_present" CHECK (btrim("chat_messages"."body") <> ''),
	CONSTRAINT "chat_messages_deletion" CHECK (("chat_messages"."deleted_at" IS NULL) = ("chat_messages"."deleted_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "muted_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "muted_users_expiration" CHECK ("muted_users"."expires_at" > "muted_users"."created_at"),
	CONSTRAINT "muted_users_revocation" CHECK ("muted_users"."revoked_at" >= "muted_users"."created_at")
);
--> statement-breakpoint
CREATE TABLE "station_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_activity_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_role_key_roles_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."roles"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_key_roles_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."roles"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_series" ADD CONSTRAINT "schedule_series_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_series" ADD CONSTRAINT "schedule_series_presenter_id_presenters_id_fk" FOREIGN KEY ("presenter_id") REFERENCES "public"."presenters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_series_id_schedule_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."schedule_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_presenter_id_presenters_id_fk" FOREIGN KEY ("presenter_id") REFERENCES "public"."presenters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_admins_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muted_users" ADD CONSTRAINT "muted_users_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muted_users" ADD CONSTRAINT "muted_users_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_activity_logs" ADD CONSTRAINT "admin_activity_logs_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_roles_role_idx" ON "admin_roles" USING btree ("role_key");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_key");--> statement-breakpoint
CREATE INDEX "schedule_series_published_dates_idx" ON "schedule_series" USING btree ("starts_on","ends_on") WHERE "schedule_series"."publication_status" = 'published' AND "schedule_series"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "schedule_series_programme_idx" ON "schedule_series" USING btree ("programme_id");--> statement-breakpoint
CREATE INDEX "schedule_series_presenter_idx" ON "schedule_series" USING btree ("presenter_id");--> statement-breakpoint
CREATE INDEX "schedule_exceptions_start_date_idx" ON "schedule_exceptions" USING btree ("starts_on");--> statement-breakpoint
CREATE INDEX "schedule_exceptions_presenter_idx" ON "schedule_exceptions" USING btree ("presenter_id");--> statement-breakpoint
CREATE INDEX "chat_messages_history_idx" ON "chat_messages" USING btree ("created_at","id") WHERE "chat_messages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "muted_users_session_idx" ON "muted_users" USING btree ("session_id","expires_at");--> statement-breakpoint
CREATE INDEX "admin_activity_logs_admin_idx" ON "admin_activity_logs" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_activity_logs_resource_idx" ON "admin_activity_logs" USING btree ("resource","resource_id","created_at");