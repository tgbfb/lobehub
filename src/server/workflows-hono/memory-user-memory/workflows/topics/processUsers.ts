import { SpanStatusCode } from '@lobechat/observability-otel/api';
import {
  buildUpstashWorkflowAttributes,
  tracer as upstashWorkflowTracer,
} from '@lobechat/observability-otel/modules/upstash-workflow';
import { MemorySourceType } from '@lobechat/types';
import { type WorkflowContext } from '@upstash/workflow';

import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import { type MemoryExtractionPayloadInput } from '@/server/services/memory/userMemory/extract';
import {
  buildWorkflowPayloadInput,
  MemoryExtractionExecutor,
  MemoryExtractionWorkflowService,
  normalizeMemoryExtractionPayload,
} from '@/server/services/memory/userMemory/extract';

const COUNT_SAMPLE_PAGE_SIZE = 200;

const { upstashWorkflowExtraHeaders } = parseMemoryExtractionConfig();

/**
 * L1: Entry for the topics extraction pipeline.
 *
 * - If `userIds` in payload, treat as explicit target list (used by hourly cron fan-out).
 * - Else sample a single page to estimate eligible users (dry-run returns this count).
 * - When not dry-run: trigger L2 (paginate-users) to walk all users.
 */
export const processUsersHandler = (context: WorkflowContext<MemoryExtractionPayloadInput>) =>
  upstashWorkflowTracer.startActiveSpan(
    'workflow:memory-user-memory:topics:process-users',
    async (span) => {
      const payload = normalizeMemoryExtractionPayload(context.requestPayload || {});
      const dryRun = !!(context.requestPayload as { dryRun?: boolean } | null)?.dryRun;

      span.setAttributes({
        ...buildUpstashWorkflowAttributes(context),
        'workflow.memory_user_memory.dry_run': dryRun,
        'workflow.memory_user_memory.payload_user_count': payload.userIds.length,
        'workflow.name': 'memory-user-memory:topics:process-users',
      });

      // Ensure source defaults to ChatTopic when caller omitted it — topics pipeline is chat-topic-only.
      const sources = payload.sources.length ? payload.sources : [MemorySourceType.ChatTopic];
      if (!sources.includes(MemorySourceType.ChatTopic)) {
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          message: 'No supported sources requested, skip topics process-users.',
          success: true,
        };
      }

      // Explicit target userIds path: skip the user-count sampling and go straight to fan-out via L2.
      if (payload.userIds.length > 0) {
        if (dryRun) {
          span.setStatus({ code: SpanStatusCode.OK });
          return {
            dryRun: true,
            message: `[DryRun] Would fan out ${payload.userIds.length} pre-specified users.`,
            success: true,
            targetUsers: payload.userIds.length,
          };
        }

        await context.run('memory:topics:process-users:trigger-paginate-fanout', () =>
          MemoryExtractionWorkflowService.triggerTopicsPaginateUsers(
            buildWorkflowPayloadInput({ ...payload, sources, userCursor: undefined }),
            { extraHeaders: upstashWorkflowExtraHeaders },
          ),
        );

        span.setStatus({ code: SpanStatusCode.OK });
        return { success: true, triggeredFanout: payload.userIds.length };
      }

      // Sample first page for a dry-run estimate.
      const executor = await MemoryExtractionExecutor.create();
      const sampleBatch = await context.run('memory:topics:process-users:sample-first-page', () =>
        executor.getUsers(COUNT_SAMPLE_PAGE_SIZE),
      );

      const sampleCount = sampleBatch.ids.length;
      const hasMorePages = !!('cursor' in sampleBatch && sampleBatch.cursor);

      if (sampleCount === 0) {
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          message: 'No eligible users for topics extraction.',
          success: true,
          totalEligibleSample: 0,
        };
      }

      const result = {
        hasMorePages,
        success: true as const,
        totalEligibleSample: sampleCount,
      };

      if (dryRun) {
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          ...result,
          dryRun: true,
          message: hasMorePages
            ? `[DryRun] At least ${sampleCount} eligible users (more pages available).`
            : `[DryRun] Exactly ${sampleCount} eligible users.`,
        };
      }

      // Trigger L2 to walk all pages from the start.
      await context.run('memory:topics:process-users:trigger-paginate', () =>
        MemoryExtractionWorkflowService.triggerTopicsPaginateUsers(
          buildWorkflowPayloadInput({
            ...payload,
            sources,
            userCursor: undefined,
            userIds: [],
          }),
          { extraHeaders: upstashWorkflowExtraHeaders },
        ),
      );

      span.setStatus({ code: SpanStatusCode.OK });
      return {
        ...result,
        message: `Triggered paginate-users (sampled ${sampleCount} users in first page).`,
      };
    },
  );
