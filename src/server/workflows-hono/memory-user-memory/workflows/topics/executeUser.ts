import { SpanStatusCode } from '@lobechat/observability-otel/api';
import {
  buildUpstashWorkflowAttributes,
  tracer as upstashWorkflowTracer,
} from '@lobechat/observability-otel/modules/upstash-workflow';
import { LayersEnum, MemorySourceType } from '@lobechat/types';
import { type WorkflowContext } from '@upstash/workflow';
import { WorkflowAbort } from '@upstash/workflow';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { getServerDB } from '@/database/server';
import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import { type MemoryExtractionPayloadInput } from '@/server/services/memory/userMemory/extract';
import {
  MemoryExtractionExecutor,
  MemoryExtractionWorkflowService,
  normalizeMemoryExtractionPayload,
} from '@/server/services/memory/userMemory/extract';

import { extractTopicWorkflow } from './extractTopic';

const TOPIC_PAGE_SIZE = 200;

const { upstashWorkflowExtraHeaders } = parseMemoryExtractionConfig();

const CEPA_LAYERS: LayersEnum[] = [
  LayersEnum.Context,
  LayersEnum.Experience,
  LayersEnum.Preference,
  LayersEnum.Activity,
];
const IDENTITY_LAYERS: LayersEnum[] = [LayersEnum.Identity];

/**
 * L3: Process topic extraction for ONE user.
 *
 * - Load user's eligible topics (respecting forceAll/forceTopics filters) in a single pass.
 * - Fan out per-topic via `context.invoke(extractTopicWorkflow)` — Upstash rewrites the URL last
 *   segment to the workflowId (`extract-topic`), which is mounted at /topics/extract-topic.
 * - After topic extraction, schedule a persona update for this user (decoupled via persona pipeline).
 */
export const executeUserHandler = (context: WorkflowContext<MemoryExtractionPayloadInput>) =>
  upstashWorkflowTracer.startActiveSpan(
    'workflow:memory-user-memory:topics:execute-user',
    async (span) => {
      const payload = normalizeMemoryExtractionPayload(context.requestPayload || {});
      const userId = payload.userId || payload.userIds[0];

      span.setAttributes({
        ...buildUpstashWorkflowAttributes(context),
        'workflow.memory_user_memory.force_all': payload.forceAll,
        'workflow.memory_user_memory.force_topics': payload.forceTopics,
        'workflow.memory_user_memory.layers': payload.layers.join(','),
        'workflow.memory_user_memory.source': payload.sources.join(','),
        'workflow.memory_user_memory.user_id': userId,
        'workflow.name': 'memory-user-memory:topics:execute-user',
      });

      if (!userId) {
        span.setStatus({ code: SpanStatusCode.OK });
        return { message: 'Missing userId for execute-user workflow.' };
      }

      if (!payload.sources.includes(MemorySourceType.ChatTopic)) {
        span.setStatus({ code: SpanStatusCode.OK });
        return { message: 'Source not supported in execute-user workflow.' };
      }

      try {
        // Early cancel check before any DB work.
        if (payload.asyncTaskId) {
          const cancelled = await context.run(
            `memory:topics:execute-user:${userId}:cancel-check:before`,
            () =>
              getServerDB().then((db) =>
                new AsyncTaskModel(db, userId).isUserMemoryExtractionCancellationRequested(
                  payload.asyncTaskId!,
                ),
              ),
          );
          if (cancelled) {
            span.setStatus({ code: SpanStatusCode.OK });
            return { cancelled: true, message: 'Cancelled before topic listing.' };
          }
        }

        const executor = await MemoryExtractionExecutor.create();

        // Either use explicitly-provided topicIds (filtered for ownership) or list all eligible topics.
        const topicIds = await context.run(
          `memory:topics:execute-user:${userId}:list-topics`,
          () =>
            payload.topicIds.length > 0
              ? executor.filterTopicIdsForUser(userId, payload.topicIds)
              : executor
                  .getTopicsForUser(
                    {
                      forceAll: payload.forceAll,
                      forceTopics: payload.forceTopics,
                      from: payload.from,
                      to: payload.to,
                      userId,
                    },
                    TOPIC_PAGE_SIZE,
                  )
                  .then((res) => res.ids),
        );

        if (!topicIds.length) {
          span.setStatus({ code: SpanStatusCode.OK });
          return {
            message: 'No eligible topics for user.',
            processedTopics: 0,
            userId,
          };
        }

        // Cancel check before fan-out so cancelled tasks stop at the earliest safe boundary.
        if (payload.asyncTaskId) {
          const cancelled = await context.run(
            `memory:topics:execute-user:${userId}:cancel-check:fanout`,
            () =>
              getServerDB().then((db) =>
                new AsyncTaskModel(db, userId).isUserMemoryExtractionCancellationRequested(
                  payload.asyncTaskId!,
                ),
              ),
          );
          if (cancelled) {
            span.setStatus({ code: SpanStatusCode.OK });
            return { cancelled: true, message: 'Cancelled before topic fan-out.' };
          }
        }

        // Fan out per topic via context.invoke. Each invocation runs as a standalone extract-topic workflow.
        await Promise.all(
          topicIds.map((topicId, index) =>
            context.invoke(`memory:topics:execute-user:${userId}:invoke:${topicId}:${index}`, {
              body: {
                asyncTaskId: payload.asyncTaskId,
                baseUrl: payload.baseUrl,
                forceAll: payload.forceAll,
                forceTopics: payload.forceTopics,
                layers: payload.layers.length
                  ? payload.layers
                  : [...CEPA_LAYERS, ...IDENTITY_LAYERS],
                sources: payload.sources,
                topicIds: [topicId],
                userId,
                userIds: [userId],
                userInitiated: payload.userInitiated,
              },
              // CEPA (4 layers) + identity (1, sequential) → 5. Parallelism matches layer count.
              flowControl: {
                key: `memory-user-memory.topics.extract-topic.user.${userId}.topic.${topicId}`,
                parallelism: 5,
              },
              headers: upstashWorkflowExtraHeaders,
              workflow: extractTopicWorkflow,
            }),
          ),
        );

        // Decoupled persona update — no longer tail-coupled to topic chain. Fires even when
        // this user had no new topics (handled by the persona pipeline's own eligibility logic).
        await context.run(`memory:topics:execute-user:${userId}:trigger-persona`, async () => {
          await MemoryExtractionWorkflowService.triggerPersonaExecuteUser(userId, payload.baseUrl, {
            extraHeaders: upstashWorkflowExtraHeaders,
          });
        });

        span.setStatus({ code: SpanStatusCode.OK });
        return {
          processedTopics: topicIds.length,
          userId,
        };
      } catch (error) {
        if (error instanceof WorkflowAbort) {
          console.warn('workflow aborted:', error.message);
          throw error;
        }

        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'execute-user workflow failed',
        });

        throw error;
      } finally {
        span.end();
      }
    },
  );
