import type { AgentRuntimeContext } from '@lobechat/agent-runtime';

/**
 * Merge a list of `AgentRuntimeContext` initial-context fragments into one,
 * preserving each fragment's nested `initialContext` payload. Later fragments
 * win on overlapping top-level keys; nested `initialContext` keys are merged
 * key-by-key. Used by the send / regeneration paths to fold caller-supplied
 * runtime context with the panel-supplied one before handing off to the agent
 * runtime.
 */
export const mergeAgentRuntimeInitialContexts = (
  ...contexts: Array<AgentRuntimeContext | undefined>
): AgentRuntimeContext | undefined => {
  const validContexts = contexts.filter(Boolean) as AgentRuntimeContext[];
  if (validContexts.length === 0) return undefined;

  const firstContext = validContexts[0]!;

  return validContexts.reduce<AgentRuntimeContext>(
    (acc, context) => ({
      ...acc,
      ...context,
      initialContext: {
        ...acc.initialContext,
        ...context.initialContext,
      },
      payload:
        acc.payload &&
        context.payload &&
        typeof acc.payload === 'object' &&
        typeof context.payload === 'object'
          ? {
              ...(acc.payload as Record<string, unknown>),
              ...(context.payload as Record<string, unknown>),
            }
          : (context.payload ?? acc.payload),
    }),
    { phase: firstContext.phase },
  );
};
