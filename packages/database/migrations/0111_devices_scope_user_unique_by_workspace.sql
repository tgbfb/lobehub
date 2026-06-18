DROP INDEX IF EXISTS "devices_user_id_device_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devices_workspace_id_device_id_unique" ON "devices" USING btree ("workspace_id","device_id") WHERE "devices"."workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devices_user_id_device_id_unique" ON "devices" USING btree ("user_id","device_id") WHERE "devices"."workspace_id" IS NULL;
