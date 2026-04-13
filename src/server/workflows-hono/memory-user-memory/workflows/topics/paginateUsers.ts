import { SpanStatusCode } from '@lobechat/observability-otel/api';
import {
  buildUpstashWorkflowAttributes,
  tracer as upstashWorkflowTracer,
} from '@lobechat/observability-otel/modules/upstash-workflow';
import { type WorkflowContext } from '@upstash/workflow';
import { chunk } from 'es-toolkit/compat';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { getServerDB } from '@/database/server';
import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import { type MemoryExtractionPayloadInput } from '@/server/services/memory/userMemory/extract';
import {
  buildWorkflowPayloadInput,
  MemoryExtractionExecutor,
  MemoryExtractionWorkflowService,
  normalizeMemoryExtractionPayload,
} from '@/server/services/memory/userMemory/extract';

const USER_PAGE_SIZE = 50;
const CHUNK_SIZE = 20;

const { upstashWorkflowExtraHeaders } = parseMemoryExtractionConfig();

/**
 * L2: Paginate users + fan-out.
 *
 * - If `userIds` provided (fan-out chunk from a prior call), trigger execute-user for each and stop.
 * - Else paginate via cursor (PAGE_SIZE=50); if batch > CHUNK_SIZE=20, split into chunks and
 *   recursively re-trigger this L2 with each chunk. Otherwise trigger execute-user directly.
 * - Always schedule the next page if a cursor exists.
 */
export const paginateUsersHandler = (context: WorkflowContext<MemoryExtractionPayloadInput>) =>
  upstashWorkflowTracer.startActiveSpan(
    'workflow:memory-user-memory:topics:paginate-users',
    async (span) => {
      const payload = normalizeMemoryExtractionPayload(context.requestPayload || {});

      span.setAttributes({
        ...buildUpstashWorkflowAttributes(context),
        'workflow.memory_user_memory.payload_user_count': payload.userIds.length,
        'workflow.name': 'memory-user-memory:topics:paginate-users',
      });

      try {
        // Fan-out chunk path: specific userIds were provided by an upstream paginate call.
        if (payload.userIds.length > 0 && !payload.userCursor) {
          await Promise.all(
            payload.userIds.map((userId) =>
              context.run(`memory:topics:paginate-users:fanout:execute:${userId}`, () =>
                MemoryExtractionWorkflowService.triggerTopicsExecuteUser(
                  userId,
                  buildWorkflowPayloadInput({
                    ...payload,
                    topicCursor: undefined,
                    topicIds: [],
                    userCursor: undefined,
                    userId,
                    userIds: [userId],
                  }),
                  { extraHeaders: upstashWorkflowExtraHeaders },
                ),
              ),
            ),
          );

          span.setStatus({ code: SpanStatusCode.OK });
          return { fannedOut: payload.userIds.length };
        }

        // Cursor pagination path.
        const userCursor = payload.userCursor
          ? { createdAt: new Date(payload.userCursor.createdAt), id: payload.userCursor.id }
          : undefined;
        if (userCursor && Number.isNaN(userCursor.createdAt.getTime())) {
          throw new Error('Invalid userCursor.createdAt for topics paginate-users');
        }

        const executor = await MemoryExtractionExecutor.create();

        // Root-level cancel check (only when asyncTaskId + at least one userId known).
        if (payload.asyncTaskId && payload.userIds[0]) {
          const cancelled = await context.run(
            'memory:topics:paginate-users:cancel-check:root',
            () =>
              getServerDB().then((db) =>
                new AsyncTaskModel(
                  db,
                  payload.userIds[0]!,
                ).isUserMemoryExtractionCancellationRequested(payload.asyncTaskId!),
              ),
          );
          if (cancelled) {
            span.setStatus({ code: SpanStatusCode.OK });
            return { cancelled: true, message: 'Cancelled at paginate-users root.' };
          }
        }

        const batch = await context.run(
          `memory:topics:paginate-users:list:${userCursor?.id || 'root'}`,
          () => executor.getUsers(USER_PAGE_SIZE, userCursor),
        );

        const userIds = batch.ids;
        const nextCursor = 'cursor' in batch ? batch.cursor : undefined;

        if (userIds.length === 0) {
          span.setStatus({ code: SpanStatusCode.OK });
          return { message: 'No users in page, pagination complete.' };
        }

        // Fan-out if batch exceeds CHUNK_SIZE; else trigger execute-user directly.
        if (userIds.length > CHUNK_SIZE) {
          const chunks = chunk(userIds, CHUNK_SIZE);
          await Promise.all(
            chunks.map((chunkIds, idx) =>
              context.run(`memory:topics:paginate-users:fanout:${idx + 1}/${chunks.length}`, () =>
                MemoryExtractionWorkflowService.triggerTopicsPaginateUsers(
                  buildWorkflowPayloadInput({
                    ...payload,
                    userCursor: undefined,
                    userId: chunkIds[0],
                    userIds: chunkIds,
                  }),
                  { extraHeaders: upstashWorkflowExtraHeaders },
                ),
              ),
            ),
          );
        } else {
          await Promise.all(
            userIds.map((userId) =>
              context.run(`memory:topics:paginate-users:execute:${userId}`, () =>
                MemoryExtractionWorkflowService.triggerTopicsExecuteUser(
                  userId,
                  buildWorkflowPayloadInput({
                    ...payload,
                    topicCursor: undefined,
                    topicIds: [],
                    userCursor: undefined,
                    userId,
                    userIds: [userId],
                  }),
                  { extraHeaders: upstashWorkflowExtraHeaders },
                ),
              ),
            ),
          );
        }

        // Schedule next page.
        if (nextCursor) {
          await context.run('memory:topics:paginate-users:schedule-next-page', () =>
            MemoryExtractionWorkflowService.triggerTopicsPaginateUsers(
              buildWorkflowPayloadInput({
                ...payload,
                userCursor: {
                  createdAt: nextCursor.createdAt.toISOString(),
                  id: nextCursor.id,
                },
                userIds: [],
              }),
              { extraHeaders: upstashWorkflowExtraHeaders },
            ),
          );
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return {
          nextCursor: nextCursor ? nextCursor.id : null,
          processedUsers: userIds.length,
        };
      } finally {
        span.end();
      }
    },
  );
