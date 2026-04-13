import { type WorkflowContext } from '@upstash/workflow';
import { z } from 'zod';

import { getServerDB } from '@/database/server';
import { type PersonaExecuteUserWorkflowPayload } from '@/server/services/memory/userMemory/extract';
import {
  buildUserPersonaJobInput,
  UserPersonaService,
} from '@/server/services/memory/userMemory/persona/service';

const payloadSchema = z.object({
  userId: z.string(),
});

/**
 * L3: Compose persona writing for ONE user.
 */
export const executeUserHandler = async (
  context: WorkflowContext<PersonaExecuteUserWorkflowPayload>,
) => {
  const payload = await context.run('memory:persona:execute-user:parse-payload', () =>
    payloadSchema.parse(context.requestPayload || {}),
  );

  const { userId } = payload;
  const db = await getServerDB();
  const service = new UserPersonaService(db);

  const result = await context.run(`memory:persona:execute-user:${userId}:compose`, async () => {
    const jobInput = await buildUserPersonaJobInput(db, userId);
    const composed = await service.composeWriting({ ...jobInput, userId });
    return {
      diffId: composed.diff?.id,
      documentId: composed.document.id,
      userId,
      version: composed.document.version,
    };
  });

  return {
    message: 'Persona composed.',
    success: true,
    ...result,
  };
};
