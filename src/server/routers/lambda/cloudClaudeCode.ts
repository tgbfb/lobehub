import debug from 'debug';
import { z } from 'zod';

import { appEnv } from '@/envs/app';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { signUserJWT } from '@/libs/trpc/utils/internalJwt';
import {
  buildSandboxWrapperCommand,
  CloudCCMessagePersistence,
} from '@/server/services/cloudClaudeCode';

const log = debug('lobe-server:cloud-claude-code-router');

const cloudCCProcedure = authedProcedure.use(serverDatabase);

const IngestSchema = z.object({
  /** Agent ID for the messages */
  agentId: z.string().optional(),
  /** One complete step's worth of raw CC stream-json lines */
  lines: z.array(z.any()).min(1),
  /** Target topic ID */
  topicId: z.string(),
});

const StartSchema = z.object({
  /** Agent ID */
  agentId: z.string(),
  /** Claude Code OAuth token (for CC auth) */
  oauthToken: z.string().optional(),
  /** User prompt */
  prompt: z.string(),
  /** Resume session ID for multi-turn */
  resumeSessionId: z.string().optional(),
  /** Target topic ID */
  topicId: z.string(),
});

export const cloudClaudeCodeRouter = router({
  /**
   * Receive a batch of raw Claude Code stream-json lines (one step),
   * convert via ClaudeCodeAdapter, and persist as structured messages.
   */
  ingest: cloudCCProcedure.input(IngestSchema).mutation(async ({ input, ctx }) => {
    const { topicId, agentId, lines } = input;

    log('ingest: topicId=%s, agentId=%s, lines=%d', topicId, agentId, lines.length);

    const persistence = new CloudCCMessagePersistence(ctx.serverDB, ctx.userId, topicId, agentId);

    const result = await persistence.processBatch(lines);

    log(
      'ingest done: assistantMsg=%s, toolMsgs=%d, sessionId=%s',
      result.assistantMessageId,
      result.toolMessageIds.length,
      result.sessionId,
    );

    return result;
  }),

  /**
   * Start a Cloud Claude Code session in the sandbox.
   * Generates JWT, builds wrapper command, and invokes sandbox runCommand.
   */
  start: cloudCCProcedure.input(StartSchema).mutation(async ({ input, ctx }) => {
    const { topicId, agentId, prompt, resumeSessionId, oauthToken } = input;

    log('start: topicId=%s, agentId=%s, prompt=%s', topicId, agentId, prompt.slice(0, 80));

    // 1. Generate short-lived JWT for sandbox → server callback
    const jwt = await signUserJWT(ctx.userId);
    const serverUrl = appEnv.APP_URL || 'https://app.lobehub.com';

    // 2. Build the inline wrapper command
    const wrapperCommand = buildSandboxWrapperCommand({
      agentId,
      prompt,
      resumeSessionId,
      topicId,
    });

    // 3. Build the full command with env vars injected
    const envPrefix = [
      `LOBEHUB_JWT=${jwt}`,
      `LOBEHUB_SERVER=${serverUrl}`,
      oauthToken ? `CLAUDE_CODE_OAUTH_TOKEN=${oauthToken}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const fullCommand = `${envPrefix} ${wrapperCommand}`;

    log('start: command length=%d', fullCommand.length);

    // 4. TODO: Call sandbox runCommand
    // For now, return the command so it can be tested manually
    // In production, this will call:
    //   await sandboxService.callTool('runCommand', { command: fullCommand });

    return {
      command: fullCommand,
      serverUrl,
      topicId,
    };
  }),
});
