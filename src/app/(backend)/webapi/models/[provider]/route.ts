import type { ChatCompletionErrorPayload } from '@lobechat/model-runtime';
import { AgentRuntimeErrorType } from '@lobechat/model-runtime';
import { isRecord } from '@lobechat/utils';
import { NextResponse } from 'next/server';

import { checkAuth } from '@/app/(backend)/middleware/auth';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { createErrorResponse } from '@/utils/errorResponse';

import { resolveValidWorkspaceIdFromRequest } from '../../_utils/workspace';

const MAX_ERROR_DEPTH = 4;

const SENSITIVE_ERROR_FIELDS = new Set([
  'api-key',
  'apikey',
  'auth',
  'authorization',
  'bearer',
  'config',
  'credential',
  'headers',
  'key',
  'ocp-apim-subscription-key',
  'options',
  'password',
  'request',
  'secret',
  'stack',
  'token',
  'x-api-key',
]);

const ERROR_FIELDS_TO_PRESERVE = [
  'code',
  'param',
  'request_id',
  'requestID',
  'status',
  'statusCode',
  'type',
] as const;

const isSensitiveField = (key: string) => SENSITIVE_ERROR_FIELDS.has(key.toLowerCase());

const toJsonSafeValue = (value: unknown, seen = new WeakSet<object>(), depth = 0): unknown => {
  if (value === null) return null;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol')
    return;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    if (depth >= MAX_ERROR_DEPTH) return '[Truncated]';

    seen.add(value);

    return value.map((item) => toJsonSafeValue(item, seen, depth + 1) ?? null);
  }

  if (!isRecord(value)) return String(value);

  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_ERROR_DEPTH) return '[Truncated]';

  seen.add(value);

  if (value instanceof Error) {
    const errorValue: Record<string, unknown> = {
      message: value.message,
      name: value.name,
    };

    for (const key of ERROR_FIELDS_TO_PRESERVE) {
      const fieldValue = (value as unknown as Record<string, unknown>)[key];
      const safeValue = toJsonSafeValue(fieldValue, seen, depth + 1);

      if (safeValue !== undefined) errorValue[key] = safeValue;
    }

    const cause = toJsonSafeValue(value.cause, seen, depth + 1);
    if (cause !== undefined) errorValue.cause = cause;

    for (const [key, fieldValue] of Object.entries(value)) {
      if (isSensitiveField(key)) continue;

      const safeValue = toJsonSafeValue(fieldValue, seen, depth + 1);
      if (safeValue !== undefined) errorValue[key] = safeValue;
    }

    return errorValue;
  }

  const result: Record<string, unknown> = {};

  for (const [key, fieldValue] of Object.entries(value)) {
    if (isSensitiveField(key)) continue;

    const safeValue = toJsonSafeValue(fieldValue, seen, depth + 1);
    if (safeValue !== undefined) result[key] = safeValue;
  }

  return result;
};

const normalizeModelFetchError = (error: unknown): Record<string, unknown> => {
  const safeError = toJsonSafeValue(error);

  if (isRecord(safeError)) return safeError as Record<string, unknown>;

  return { message: safeError === undefined ? 'Unknown error' : String(safeError) };
};

const normalizeModelListResponse = (list: unknown) => toJsonSafeValue(list);

export const GET = checkAuth(async (req, { params, userId, serverDB }) => {
  const provider = (await params)!.provider!;

  try {
    const workspaceId = await resolveValidWorkspaceIdFromRequest({ req, serverDB, userId });

    // Read user's provider config from database
    const agentRuntime = await initModelRuntimeFromDB(serverDB, userId, provider, workspaceId);

    const list = await agentRuntime.models();

    return NextResponse.json(normalizeModelListResponse(list));
  } catch (e) {
    const errorPayload = isRecord(e) ? (e as ChatCompletionErrorPayload) : undefined;
    const errorType = errorPayload?.errorType || AgentRuntimeErrorType.ProviderBizError;
    const errorContent = errorPayload?.error;
    const message = errorPayload?.message;

    const error = errorContent || e;
    // track the error at server side
    console.error(`Route: [${provider}] ${errorType}:`, error);

    return createErrorResponse(errorType, {
      error: normalizeModelFetchError(error),
      message,
      provider,
    });
  }
});
