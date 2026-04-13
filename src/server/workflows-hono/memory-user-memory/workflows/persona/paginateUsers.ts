import { type WorkflowContext } from '@upstash/workflow';
import { chunk } from 'es-toolkit/compat';

import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import {
  MemoryExtractionExecutor,
  MemoryExtractionWorkflowService,
  type PersonaProcessUsersWorkflowPayload,
} from '@/server/services/memory/userMemory/extract';

const USER_PAGE_SIZE = 50;
const CHUNK_SIZE = 20;

const { upstashWorkflowExtraHeaders } = parseMemoryExtractionConfig();

const requireBaseUrl = (baseUrl?: string) => {
  if (!baseUrl) throw new Error('Missing baseUrl for persona paginate-users');
  return baseUrl;
};

/**
 * L2: Paginate eligible users and fan-out to execute-user.
 *
 * Reuses `executor.getUsers` (same base set as topics) — persona eligibility finer-grained
 * filtering lives inside `UserPersonaService.composeWriting`, which is a no-op for users whose
 * persona is up-to-date.
 */
export const paginateUsersHandler = async (
  context: WorkflowContext<PersonaProcessUsersWorkflowPayload>,
) => {
  const payload = context.requestPayload || ({} as PersonaProcessUsersWorkflowPayload);
  const baseUrl = requireBaseUrl(payload.baseUrl);

  // Fan-out chunk path.
  if (payload.userIds && payload.userIds.length > 0 && !payload.cursor) {
    await Promise.all(
      payload.userIds.map((userId) =>
        context.run(`memory:persona:paginate-users:fanout:execute:${userId}`, () =>
          MemoryExtractionWorkflowService.triggerPersonaExecuteUser(userId, baseUrl, {
            extraHeaders: upstashWorkflowExtraHeaders,
          }),
        ),
      ),
    );
    return { fannedOut: payload.userIds.length };
  }

  // Cursor pagination.
  const cursor = payload.cursor
    ? { createdAt: new Date(payload.cursor.createdAt), id: payload.cursor.id }
    : undefined;
  if (cursor && Number.isNaN(cursor.createdAt.getTime())) {
    throw new Error('Invalid cursor.createdAt for persona paginate-users');
  }

  const executor = await MemoryExtractionExecutor.create();
  const batch = await context.run(
    `memory:persona:paginate-users:list:${cursor?.id || 'root'}`,
    () => executor.getUsers(USER_PAGE_SIZE, cursor),
  );

  const userIds = batch.ids;
  const nextCursor = 'cursor' in batch ? batch.cursor : undefined;

  if (userIds.length === 0) {
    return { message: 'No users in page, pagination complete.' };
  }

  if (userIds.length > CHUNK_SIZE) {
    const chunks = chunk(userIds, CHUNK_SIZE);
    await Promise.all(
      chunks.map((chunkIds, idx) =>
        context.run(`memory:persona:paginate-users:fanout:${idx + 1}/${chunks.length}`, () =>
          MemoryExtractionWorkflowService.triggerPersonaPaginateUsers(
            { baseUrl, userIds: chunkIds },
            { extraHeaders: upstashWorkflowExtraHeaders },
          ),
        ),
      ),
    );
  } else {
    await Promise.all(
      userIds.map((userId) =>
        context.run(`memory:persona:paginate-users:execute:${userId}`, () =>
          MemoryExtractionWorkflowService.triggerPersonaExecuteUser(userId, baseUrl, {
            extraHeaders: upstashWorkflowExtraHeaders,
          }),
        ),
      ),
    );
  }

  if (nextCursor) {
    await context.run('memory:persona:paginate-users:schedule-next-page', () =>
      MemoryExtractionWorkflowService.triggerPersonaPaginateUsers(
        {
          baseUrl,
          cursor: { createdAt: nextCursor.createdAt.toISOString(), id: nextCursor.id },
        },
        { extraHeaders: upstashWorkflowExtraHeaders },
      ),
    );
  }

  return {
    nextCursor: nextCursor ? nextCursor.id : null,
    processedUsers: userIds.length,
  };
};
