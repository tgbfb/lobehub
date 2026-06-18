import { NextResponse } from 'next/server';

import type { OnTrajectoryCompletePayload } from '@/server/workflows/agentEvalRun';

// Force dynamic so Next.js does not statically analyse this route at build time.
// The import chain (AgentEvalRunWorkflow → qstashClient, AgentEvalRunService → MCPService)
// contains module-level singletons that throw ERR_INVALID_ARG_TYPE during Turbopack's
// page-data collection phase. Lazy imports below defer all initialisation to request time.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { default: debug } = await import('debug');
  const log = debug('lobe-server:workflows:on-trajectory-complete');

  try {
    const { AgentEvalRunModel } = await import('@/database/models/agentEval');
    const { getServerDB } = await import('@/database/server');
    const { AgentEvalRunService } = await import('@/server/services/agentEvalRun');
    const { AgentEvalRunWorkflow } = await import('@/server/workflows/agentEvalRun');
    const { resolveAgentEvalRunWorkspace } = await import(
      '@/server/workflows/agentEvalRun/utils'
    );

    const body = (await req.json()) as OnTrajectoryCompletePayload;
    const {
      runId,
      testCaseId,
      userId,
      operationId,
      reason,
      status,
      cost,
      duration,
      errorDetail,
      errorMessage,
      llmCalls,
      steps,
      toolCalls,
      totalTokens,
    } = body;

    if (!runId || !testCaseId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    log(
      'Received: runId=%s testCaseId=%s operationId=%s reason=%s status=%s cost=%s duration=%s steps=%s totalTokens=%s',
      runId,
      testCaseId,
      operationId,
      reason,
      status,
      cost,
      duration,
      steps,
      totalTokens,
    );

    const db = await getServerDB();
    const wsId = await resolveAgentEvalRunWorkspace(db, runId);

    // Check if run was aborted — skip processing to avoid overwriting abort state
    const runModel = new AgentEvalRunModel(db, userId, wsId);
    const run = await runModel.findById(runId);
    if (run?.status === 'aborted') {
      log('Run aborted, skipping: runId=%s testCaseId=%s', runId, testCaseId);
      return NextResponse.json({ cancelled: true });
    }

    const service = new AgentEvalRunService(db, userId, wsId);

    const { allDone, completedCount } = await service.recordTrajectoryCompletion({
      runId,
      status,
      telemetry: {
        completionReason: reason,
        cost,
        duration,
        errorDetail,
        errorMessage,
        llmCalls,
        steps,
        toolCalls,
        totalTokens,
      },
      testCaseId,
    });

    log('Completion check: %d completed, allDone=%s', completedCount, allDone);

    if (allDone) {
      console.info(
        '[on-trajectory-complete] All test cases done for run %s, triggering finalize',
        runId,
      );
      await AgentEvalRunWorkflow.triggerFinalizeRun({ runId, userId });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[on-trajectory-complete] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
