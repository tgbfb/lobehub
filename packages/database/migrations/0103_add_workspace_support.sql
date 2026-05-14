ALTER TABLE "agents" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agents_files" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agents_knowledge_bases" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_bot_providers" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_cron_jobs" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_documents" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_eval_benchmarks" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_eval_datasets" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_eval_run_topics" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_eval_runs" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_eval_test_cases" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_operations" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "async_tasks" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "chat_groups" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "chat_groups_agents" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "document_histories" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_base_files" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "generation_batches" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "generation_topics" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "message_chunks" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "message_groups" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "message_plugins" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "message_queries" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "message_query_chunks" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "message_tts" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "message_translates" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "messages_files" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "messenger_account_links" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "embeddings" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "unstructured_chunks" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "rag_eval_dataset_records" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "rag_eval_datasets" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "rag_eval_evaluations" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "rag_eval_evaluation_records" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "agents_to_sessions" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "file_chunks" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "files_to_sessions" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "session_groups" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "task_comments" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "task_documents" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "task_topics" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "topic_documents" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "topic_shares" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "user_installed_plugins" ADD COLUMN "workspace_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_slug_workspace_id_unique" ON "agents" USING btree ("workspace_id","slug") WHERE "agents"."workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "agents_workspace_id_idx" ON "agents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agents_files_workspace_id_idx" ON "agents_files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agents_knowledge_bases_workspace_id_idx" ON "agents_knowledge_bases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_bot_providers_workspace_id_idx" ON "agent_bot_providers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_cron_jobs_workspace_id_idx" ON "agent_cron_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_documents_workspace_id_idx" ON "agent_documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_eval_benchmarks_workspace_id_idx" ON "agent_eval_benchmarks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_eval_datasets_workspace_id_idx" ON "agent_eval_datasets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_eval_run_topics_workspace_id_idx" ON "agent_eval_run_topics" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_eval_runs_workspace_id_idx" ON "agent_eval_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_eval_test_cases_workspace_id_idx" ON "agent_eval_test_cases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_operations_workspace_id_idx" ON "agent_operations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_skills_workspace_id_idx" ON "agent_skills" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ai_models_workspace_id_idx" ON "ai_models" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ai_providers_workspace_id_idx" ON "ai_providers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "async_tasks_workspace_id_idx" ON "async_tasks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "chat_groups_workspace_id_idx" ON "chat_groups" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "chat_groups_agents_workspace_id_idx" ON "chat_groups_agents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "document_histories_workspace_id_idx" ON "document_histories" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_slug_workspace_id_unique" ON "documents" USING btree ("workspace_id","slug") WHERE "documents"."workspace_id" IS NOT NULL AND "documents"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "documents_workspace_id_idx" ON "documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "files_workspace_id_idx" ON "files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "knowledge_base_files_workspace_id_idx" ON "knowledge_base_files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "knowledge_bases_workspace_id_idx" ON "knowledge_bases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "generation_batches_workspace_id_idx" ON "generation_batches" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "generation_topics_workspace_id_idx" ON "generation_topics" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "generations_workspace_id_idx" ON "generations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "message_chunks_workspace_id_idx" ON "message_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "message_groups_workspace_id_idx" ON "message_groups" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "message_plugins_workspace_id_idx" ON "message_plugins" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "message_queries_workspace_id_idx" ON "message_queries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "message_query_chunks_workspace_id_idx" ON "message_query_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "message_tts_workspace_id_idx" ON "message_tts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "message_translates_workspace_id_idx" ON "message_translates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "messages_workspace_id_idx" ON "messages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "messages_files_workspace_id_idx" ON "messages_files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "messenger_account_links_workspace_id_idx" ON "messenger_account_links" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_workspace" ON "notifications" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "chunks_workspace_id_idx" ON "chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "document_chunks_workspace_id_idx" ON "document_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "embeddings_workspace_id_idx" ON "embeddings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "unstructured_chunks_workspace_id_idx" ON "unstructured_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "rag_eval_dataset_records_workspace_id_idx" ON "rag_eval_dataset_records" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "rag_eval_datasets_workspace_id_idx" ON "rag_eval_datasets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "rag_eval_evaluations_workspace_id_idx" ON "rag_eval_evaluations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "rag_eval_evaluation_records_workspace_id_idx" ON "rag_eval_evaluation_records" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agents_to_sessions_workspace_id_idx" ON "agents_to_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "file_chunks_workspace_id_idx" ON "file_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "files_to_sessions_workspace_id_idx" ON "files_to_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "session_groups_workspace_id_idx" ON "session_groups" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_slug_workspace_id_unique" ON "sessions" USING btree ("workspace_id","slug") WHERE "sessions"."workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_workspace_id_idx" ON "sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "briefs_workspace_id_idx" ON "briefs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "task_comments_workspace_id_idx" ON "task_comments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_workspace_id_idx" ON "task_dependencies" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "task_documents_workspace_id_idx" ON "task_documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "task_topics_workspace_id_idx" ON "task_topics" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_id_idx" ON "tasks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "threads_workspace_id_idx" ON "threads" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "topic_documents_workspace_id_idx" ON "topic_documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "topic_shares_workspace_id_idx" ON "topic_shares" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "topics_workspace_id_idx" ON "topics" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "user_installed_plugins_workspace_id_idx" ON "user_installed_plugins" USING btree ("workspace_id");