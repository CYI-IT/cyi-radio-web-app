ALTER TABLE "chat_sessions" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "position" bigint;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "revision" bigserial NOT NULL;--> statement-breakpoint
WITH ranked AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS number FROM "chat_messages"
)
UPDATE "chat_messages" SET "position" = ranked.number, "revision" = ranked.number
FROM ranked WHERE "chat_messages"."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_messages_session_position_idx" ON "chat_messages" USING btree ("session_id","position");--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_token_hash_unique" UNIQUE("token_hash");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_position_unique" UNIQUE("position");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_revision_unique" UNIQUE("revision");--> statement-breakpoint
INSERT INTO "permissions" ("key", "description")
VALUES ('chat.moderate', 'Delete public chat messages and manage chat session mutes')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
  ('super-admin', 'chat.moderate'),
  ('administrator', 'chat.moderate'),
  ('chat-moderator', 'chat.moderate')
ON CONFLICT ("role_key", "permission_key") DO NOTHING;
