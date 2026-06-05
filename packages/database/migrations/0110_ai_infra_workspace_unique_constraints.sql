-- Replace the composite primary keys on ai_providers / ai_models with a dedicated
-- surrogate uuid "_id" primary key, and split the business-key uniqueness between
-- personal and workspace scopes so workspace-scoped upserts can use matching
-- ON CONFLICT targets.
ALTER TABLE "ai_models" DROP CONSTRAINT IF EXISTS "ai_models_id_provider_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "ai_providers" DROP CONSTRAINT IF EXISTS "ai_providers_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN IF NOT EXISTS "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_providers_id_user_id_unique" ON "ai_providers" USING btree ("id","user_id") WHERE "ai_providers"."workspace_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_providers_id_user_id_workspace_id_unique" ON "ai_providers" USING btree ("id","user_id","workspace_id") WHERE "ai_providers"."workspace_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_id_provider_id_user_id_unique" ON "ai_models" USING btree ("id","provider_id","user_id") WHERE "ai_models"."workspace_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_id_provider_id_user_id_workspace_id_unique" ON "ai_models" USING btree ("id","provider_id","user_id","workspace_id") WHERE "ai_models"."workspace_id" is not null;
