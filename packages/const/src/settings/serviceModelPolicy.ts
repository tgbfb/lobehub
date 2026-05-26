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

const INPUT_COMPLETION_DENY = [
  { model: '*gpt-5.4-pro', provider: '*' },
  { model: '*gpt-5.5-pro', provider: '*' },
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
  agentMeta: policy({ mode: 'denylist', source: 'chat' }),
  followUpAction: policy({ mode: 'denylist', source: 'chat' }),
  generationTopic: policy({ mode: 'denylist', source: 'chat' }),
  historyCompress: policy({ mode: 'denylist', source: 'chat' }),
  inputCompletion: policy({
    deny: INPUT_COMPLETION_DENY,
    invalidSelection: 'empty',
    mode: 'denylist',
    source: 'chat',
  }),
  memoryAnalysisAgentConfig: policy({ mode: 'denylist', source: 'chat' }),
  promptRewrite: policy({ mode: 'denylist', source: 'chat' }),
  thread: policy({ mode: 'denylist', source: 'chat' }),
  topic: policy({ mode: 'denylist', source: 'chat' }),
  translation: policy({ mode: 'denylist', source: 'chat' }),
  userMemoryEmbedding: policy({
    mode: 'denylist',
    source: 'embedding',
  }),
  userMemoryPersonaWriter: policy({ mode: 'denylist', source: 'chat' }),
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
