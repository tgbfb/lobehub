import { type WorkflowContext } from '@upstash/workflow';

import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import {
  MemoryExtractionExecutor,
  MemoryExtractionWorkflowService,
  type PersonaProcessUsersWorkflowPayload,
} from '@/server/services/memory/userMemory/extract';

const COUNT_SAMPLE_PAGE_SIZE = 200;

const { upstashWorkflowExtraHeaders } = parseMemoryExtractionConfig();

const requireBaseUrl = (baseUrl?: string) => {
  if (!baseUrl) throw new Error('Missing baseUrl for persona process-users');
  return baseUrl;
};

/**
 * L1: Entry for the persona update pipeline.
 *
 * - If payload `userIds` provided, fan out directly via L2.
 * - Else sample first page for dry-run estimate; when not dry-run, trigger L2 cursor walk.
 */
export const processUsersHandler = async (
  context: WorkflowContext<PersonaProcessUsersWorkflowPayload>,
) => {
  const payload = context.requestPayload || ({} as PersonaProcessUsersWorkflowPayload);
  const baseUrl = requireBaseUrl(payload.baseUrl);
  const dryRun = !!payload.dryRun;

  if (payload.userIds && payload.userIds.length > 0) {
    if (dryRun) {
      return {
        dryRun: true,
        message: `[DryRun] Would fan out ${payload.userIds.length} pre-specified users.`,
        success: true,
        targetUsers: payload.userIds.length,
      };
    }

    await context.run('memory:persona:process-users:trigger-paginate-fanout', () =>
      MemoryExtractionWorkflowService.triggerPersonaPaginateUsers(
        { baseUrl, userIds: payload.userIds },
        { extraHeaders: upstashWorkflowExtraHeaders },
      ),
    );

    return { success: true, triggeredFanout: payload.userIds.length };
  }

  const executor = await MemoryExtractionExecutor.create();
  const sampleBatch = await context.run('memory:persona:process-users:sample-first-page', () =>
    executor.getUsers(COUNT_SAMPLE_PAGE_SIZE),
  );

  const sampleCount = sampleBatch.ids.length;
  const hasMorePages = !!('cursor' in sampleBatch && sampleBatch.cursor);

  if (sampleCount === 0) {
    return {
      message: 'No eligible users for persona update.',
      success: true,
      totalEligibleSample: 0,
    };
  }

  if (dryRun) {
    return {
      dryRun: true,
      hasMorePages,
      message: hasMorePages
        ? `[DryRun] At least ${sampleCount} eligible users (more pages available).`
        : `[DryRun] Exactly ${sampleCount} eligible users.`,
      success: true,
      totalEligibleSample: sampleCount,
    };
  }

  await context.run('memory:persona:process-users:trigger-paginate', () =>
    MemoryExtractionWorkflowService.triggerPersonaPaginateUsers(
      { baseUrl },
      { extraHeaders: upstashWorkflowExtraHeaders },
    ),
  );

  return {
    hasMorePages,
    message: `Triggered paginate-users (sampled ${sampleCount} users in first page).`,
    success: true,
    totalEligibleSample: sampleCount,
  };
};
