CREATE TABLE "agent_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"share_config" jsonb,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "share_id" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "guest_token" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "visitor_user_id" text;--> statement-breakpoint
ALTER TABLE "agent_shares" ADD CONSTRAINT "agent_shares_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_shares_agent_id_unique" ON "agent_shares" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_shares_visibility_idx" ON "agent_shares" USING btree ("visibility");--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_visitor_user_id_users_id_fk" FOREIGN KEY ("visitor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topics_share_id_idx" ON "topics" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "topics_guest_token_idx" ON "topics" USING btree ("guest_token");