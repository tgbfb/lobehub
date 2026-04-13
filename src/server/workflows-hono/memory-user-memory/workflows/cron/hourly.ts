import { type WorkflowContext } from '@upstash/workflow';

import { appEnv } from '@/envs/app';
import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import {
  type MemoryExtractionHourlyWorkflowPayload,
  type MemoryExtractionPayloadInput,
  MemoryExtractionWorkflowService,
} from '@/server/services/memory/userMemory/extract';

const { webhook, upstashWorkflowExtraHeaders } = parseMemoryExtractionConfig();

const resolveBaseUrl = () => webhook.baseUrl || appEnv.INTERNAL_APP_URL || appEnv.APP_URL;

/**
 * External cron entry.
 *
 * QStash scheduled cron posts here hourly. Responsibility: dispatch both pipelines (topics + persona)
 * L1 in parallel. Each pipeline then does its own pagination and filtering — this handler stays thin.
 */
export const hourlyCronHandler = async (
  context: WorkflowContext<MemoryExtractionHourlyWorkflowPayload>,
) => {
  const payload = context.requestPayload || ({} as MemoryExtractionHourlyWorkflowPayload);
  const baseUrl = payload.baseUrl || resolveBaseUrl();
  if (!baseUrl) {
    throw new Error('Missing baseUrl for hourly cron dispatcher');
  }

  const dryRun = !!payload.dryRun;

  await context.run('memory:cron:hourly:trigger-topics-process-users', () =>
    MemoryExtractionWorkflowService.triggerTopicsProcessUsers(
      // `dryRun` isn't part of MemoryExtractionPayloadInput but is forwarded verbatim in the JSON
      // body; the topics L1 handler reads it off the raw request payload.
      { baseUrl, dryRun, mode: 'workflow' } as MemoryExtractionPayloadInput & { dryRun?: boolean },
      { extraHeaders: upstashWorkflowExtraHeaders },
    ),
  );

  await context.run('memory:cron:hourly:trigger-persona-process-users', () =>
    MemoryExtractionWorkflowService.triggerPersonaProcessUsers(
      { baseUrl, dryRun },
      { extraHeaders: upstashWorkflowExtraHeaders },
    ),
  );

  return {
    dispatched: { persona: true, topics: true },
    dryRun,
    message: dryRun
      ? '[DryRun] Dispatched both topics and persona pipelines in dry-run mode.'
      : 'Dispatched both topics and persona pipelines.',
    success: true,
  };
};
