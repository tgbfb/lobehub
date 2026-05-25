import type { UserServiceModelConfigKey } from '@lobechat/types';

export type ServiceModelSource = 'chat' | 'embedding';

export interface ServiceModelCandidate {
  model: string;
  provider: string;
}

export interface ServiceModelMatcher {
  model: string;
  provider: string;
}

export interface ServiceModelProviderGroup<TModel extends { id: string } = { id: string }> {
  children: TModel[];
  id: string;
  name?: string;
}

export interface ServiceModelPolicy {
  allow?: readonly ServiceModelMatcher[];
  deny?: readonly ServiceModelMatcher[];
  fallback?: readonly ServiceModelMatcher[];
  invalidSelection: 'fallback' | 'empty';
  mode: 'allowlist' | 'denylist';
  source: ServiceModelSource;
}

const LOW_LATENCY_JSON_ALLOW = [
  { model: 'gpt-4o-mini', provider: 'openai' },
  { model: 'gpt-4.1-mini', provider: 'openai' },
  { model: 'claude-3-5-haiku*', provider: 'anthropic' },
  { model: 'gemini-2.0-flash-lite', provider: 'google' },
  { model: 'gemini-2.5-flash-lite*', provider: 'google' },
  { model: 'gemini-2.0-flash-lite', provider: 'vertexai' },
  { model: 'gemini-2.5-flash-lite*', provider: 'vertexai' },
  { model: 'deepseek-chat', provider: 'deepseek' },
] as const satisfies readonly ServiceModelMatcher[];

const FAST_TEXT_ALLOW = [
  ...LOW_LATENCY_JSON_ALLOW,
  { model: 'gemini-2.0-flash', provider: 'google' },
  { model: 'gemini-2.0-flash', provider: 'vertexai' },
] as const satisfies readonly ServiceModelMatcher[];

const TEXT_TASK_DENY = [
  { model: '*thinking*', provider: '*' },
  { model: '*reasoning*', provider: '*' },
  { model: '*image*', provider: '*' },
  { model: '*vision*', provider: '*' },
  { model: '*video*', provider: '*' },
  { model: '*search-preview*', provider: '*' },
  { model: '*morph*', provider: '*' },
  { model: '*embedding*', provider: '*' },
] as const satisfies readonly ServiceModelMatcher[];

const STRUCTURED_TASK_DENY = [
  ...TEXT_TASK_DENY,
  { model: '*r1*', provider: '*' },
  { model: '*o1*', provider: '*' },
  { model: '*o3*', provider: '*' },
  { model: '*o4*', provider: '*' },
] as const satisfies readonly ServiceModelMatcher[];

const policy = ({
  allow,
  deny,
  fallback,
  invalidSelection = 'fallback',
  mode,
  source,
}: Omit<ServiceModelPolicy, 'fallback' | 'invalidSelection'> &
  Partial<Pick<ServiceModelPolicy, 'fallback' | 'invalidSelection'>>): ServiceModelPolicy => ({
  allow,
  deny,
  fallback: fallback ?? (allow ? [...allow] : undefined),
  invalidSelection,
  mode,
  source,
});

export const SERVICE_MODEL_POLICIES = {
  agentMeta: policy({
    allow: FAST_TEXT_ALLOW,
    deny: TEXT_TASK_DENY,
    mode: 'allowlist',
    source: 'chat',
  }),
  followUpAction: policy({
    allow: LOW_LATENCY_JSON_ALLOW,
    deny: STRUCTURED_TASK_DENY,
    mode: 'allowlist',
    source: 'chat',
  }),
  generationTopic: policy({
    allow: FAST_TEXT_ALLOW,
    deny: TEXT_TASK_DENY,
    mode: 'allowlist',
    source: 'chat',
  }),
  historyCompress: policy({
    deny: TEXT_TASK_DENY,
    mode: 'denylist',
    source: 'chat',
  }),
  inputCompletion: policy({
    allow: LOW_LATENCY_JSON_ALLOW,
    deny: STRUCTURED_TASK_DENY,
    mode: 'allowlist',
    source: 'chat',
  }),
  memoryAnalysisAgentConfig: policy({
    deny: TEXT_TASK_DENY,
    mode: 'denylist',
    source: 'chat',
  }),
  promptRewrite: policy({
    allow: FAST_TEXT_ALLOW,
    deny: TEXT_TASK_DENY,
    mode: 'allowlist',
    source: 'chat',
  }),
  thread: policy({
    allow: FAST_TEXT_ALLOW,
    deny: TEXT_TASK_DENY,
    mode: 'allowlist',
    source: 'chat',
  }),
  topic: policy({
    allow: FAST_TEXT_ALLOW,
    deny: TEXT_TASK_DENY,
    mode: 'allowlist',
    source: 'chat',
  }),
  translation: policy({
    deny: TEXT_TASK_DENY,
    mode: 'denylist',
    source: 'chat',
  }),
  userMemoryEmbedding: policy({
    mode: 'denylist',
    source: 'embedding',
  }),
  userMemoryPersonaWriter: policy({
    deny: TEXT_TASK_DENY,
    mode: 'denylist',
    source: 'chat',
  }),
} as const satisfies Record<UserServiceModelConfigKey, ServiceModelPolicy>;

const wildcardMatch = (pattern: string, value: string) => {
  const normalizedPattern = pattern.toLowerCase();
  const normalizedValue = value.toLowerCase();

  if (normalizedPattern === '*') return true;
  if (!normalizedPattern.includes('*')) return normalizedPattern === normalizedValue;

  const parts = normalizedPattern.split('*');
  let searchIndex = 0;

  for (const [index, part] of parts.entries()) {
    if (!part) continue;

    const partIndex = normalizedValue.indexOf(part, searchIndex);
    if (partIndex === -1) return false;
    if (index === 0 && partIndex !== 0) return false;

    searchIndex = partIndex + part.length;
  }

  const lastPart = parts.at(-1);
  return !lastPart || normalizedValue.endsWith(lastPart);
};

const matchCandidate = (matcher: ServiceModelMatcher, candidate: ServiceModelCandidate) =>
  wildcardMatch(matcher.provider, candidate.provider) &&
  wildcardMatch(matcher.model, candidate.model);

const matchAny = (
  matchers: readonly ServiceModelMatcher[] | undefined,
  candidate: ServiceModelCandidate,
) => matchers?.some((matcher) => matchCandidate(matcher, candidate)) ?? false;

export const getServiceModelPolicy = (key: UserServiceModelConfigKey) =>
  SERVICE_MODEL_POLICIES[key];

export const isServiceModelCandidateAllowed = (
  policy: ServiceModelPolicy | undefined,
  candidate: ServiceModelCandidate,
) => {
  if (!policy) return true;
  if (matchAny(policy.deny, candidate)) return false;

  if (policy.mode === 'allowlist') return matchAny(policy.allow, candidate);

  return true;
};

export const filterServiceModelCandidates = <TModel extends { id: string }>(
  policy: ServiceModelPolicy | undefined,
  providers: ServiceModelProviderGroup<TModel>[],
) =>
  providers
    .map((provider) => ({
      ...provider,
      children: provider.children.filter((model) =>
        isServiceModelCandidateAllowed(policy, { model: model.id, provider: provider.id }),
      ),
    }))
    .filter((provider) => provider.children.length > 0);

export const resolveServiceModelFallback = <TModel extends { id: string }>(
  policy: ServiceModelPolicy | undefined,
  providers: ServiceModelProviderGroup<TModel>[],
): ServiceModelCandidate | undefined => {
  const candidates = filterServiceModelCandidates(policy, providers).flatMap((provider) =>
    provider.children.map((model) => ({ model: model.id, provider: provider.id })),
  );

  if (policy?.fallback) {
    for (const matcher of policy.fallback) {
      const fallbackCandidate = candidates.find((candidate) => matchCandidate(matcher, candidate));

      if (fallbackCandidate) return fallbackCandidate;
    }
  }

  return candidates[0];
};
