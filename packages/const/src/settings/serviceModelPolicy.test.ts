import { describe, expect, it } from 'vitest';

import {
  filterServiceModelCandidates,
  getServiceModelPolicy,
  isServiceModelCandidateAllowed,
  resolveServiceModelFallback,
  type ServiceModelPolicy,
} from './serviceModelPolicy';

describe('serviceModelPolicy', () => {
  const providerGroups = [
    {
      children: [
        { abilities: { reasoning: true }, id: 'gpt-4o-mini' },
        { abilities: { reasoning: false }, id: 'gpt-5-thinking' },
        { abilities: { vision: false }, id: 'gpt-image-1' },
        { abilities: { functionCall: true }, id: 'private-fast-json' },
      ],
      id: 'openai',
    },
    {
      children: [
        { abilities: { reasoning: true }, id: 'claude-3-5-haiku-latest' },
        { abilities: { reasoning: false }, id: 'claude-opus-4-thinking' },
      ],
      id: 'anthropic',
    },
  ];

  it('returns a policy that allows openai gpt-4o-mini for input completion', () => {
    const policy = getServiceModelPolicy('inputCompletion');

    expect(
      isServiceModelCandidateAllowed(policy, { model: 'gpt-4o-mini', provider: 'openai' }),
    ).toBe(true);
  });

  it('denies wildcard-matched unsuitable input completion models', () => {
    const policy = getServiceModelPolicy('inputCompletion');

    expect(
      isServiceModelCandidateAllowed(policy, { model: 'gpt-5-thinking', provider: 'openai' }),
    ).toBe(false);
    expect(
      isServiceModelCandidateAllowed(policy, { model: 'gpt-image-1', provider: 'openai' }),
    ).toBe(false);
  });

  it('lets deny rules override allow rules', () => {
    const policy = {
      allow: [{ model: 'gpt-4o-mini', provider: 'openai' }],
      deny: [{ model: 'gpt-4o-mini', provider: 'openai' }],
      invalidSelection: 'fallback',
      mode: 'allowlist',
      source: 'chat',
    } satisfies ServiceModelPolicy;

    expect(
      isServiceModelCandidateAllowed(policy, { model: 'gpt-4o-mini', provider: 'openai' }),
    ).toBe(false);
  });

  it('allows arbitrary models in denylist mode unless they match deny rules', () => {
    const policy = getServiceModelPolicy('historyCompress');

    expect(
      isServiceModelCandidateAllowed(policy, { model: 'private-fast-json', provider: 'custom' }),
    ).toBe(true);
    expect(
      isServiceModelCandidateAllowed(policy, { model: 'my-thinking-model', provider: 'custom' }),
    ).toBe(false);
  });

  it('filters provider groups using manual provider and model rules', () => {
    const policy = getServiceModelPolicy('inputCompletion');

    expect(filterServiceModelCandidates(policy, providerGroups)).toEqual([
      {
        children: [{ abilities: { reasoning: true }, id: 'gpt-4o-mini' }],
        id: 'openai',
      },
      {
        children: [{ abilities: { reasoning: true }, id: 'claude-3-5-haiku-latest' }],
        id: 'anthropic',
      },
    ]);
  });

  it('resolves input completion fallback to openai gpt-4o-mini', () => {
    const policy = getServiceModelPolicy('inputCompletion');

    expect(resolveServiceModelFallback(policy, providerGroups)).toEqual({
      model: 'gpt-4o-mini',
      provider: 'openai',
    });
  });

  it('keeps arbitrary custom models allowed when policy is undefined', () => {
    expect(
      isServiceModelCandidateAllowed(undefined, {
        model: 'custom-private-model',
        provider: 'custom',
      }),
    ).toBe(true);
  });
});
