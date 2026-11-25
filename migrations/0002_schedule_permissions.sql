INSERT INTO "permissions" ("key", "description") VALUES
  ('programmes.manage', 'Manage programmes and presenters'),
  ('schedule.manage', 'Manage schedule series and occurrence exceptions'),
  ('schedule.override', 'Publish overlapping schedules with an audit reason')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
  ('super-admin', 'programmes.manage'),
  ('super-admin', 'schedule.manage'),
  ('super-admin', 'schedule.override'),
  ('administrator', 'programmes.manage'),
  ('administrator', 'schedule.manage'),
  ('schedule-manager', 'schedule.manage'),
  ('content-manager', 'programmes.manage')
ON CONFLICT ("role_key", "permission_key") DO NOTHING;
