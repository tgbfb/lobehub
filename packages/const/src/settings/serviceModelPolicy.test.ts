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
        { abilities: { reasoning: true }, id: 'gpt-5.4-pro' },
        { abilities: { reasoning: true }, id: 'gpt-5.5-pro' },
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

  it('allows regular input completion models', () => {
    const policy = getServiceModelPolicy('inputCompletion');

    expect(
      isServiceModelCandidateAllowed(policy, { model: 'gpt-4o-mini', provider: 'openai' }),
    ).toBe(true);
    expect(
      isServiceModelCandidateAllowed(policy, { model: 'private-fast-json', provider: 'custom' }),
    ).toBe(true);
  });

  it('denies only the configured GPT Pro models for input completion', () => {
    const policy = getServiceModelPolicy('inputCompletion');

    expect(
      isServiceModelCandidateAllowed(policy, { model: 'gpt-5.4-pro', provider: 'openai' }),
    ).toBe(false);
    expect(
      isServiceModelCandidateAllowed(policy, { model: 'gpt-5.5-pro', provider: 'openai' }),
    ).toBe(false);
    expect(
      isServiceModelCandidateAllowed(policy, { model: 'openai/gpt-5.5-pro', provider: 'custom' }),
    ).toBe(false);
    expect(isServiceModelCandidateAllowed(policy, { model: 'gpt-5.4', provider: 'openai' })).toBe(
      true,
    );
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

  it('allows arbitrary models in unrestricted denylist policies', () => {
    const policy = getServiceModelPolicy('historyCompress');

    expect(
      isServiceModelCandidateAllowed(policy, { model: 'private-fast-json', provider: 'custom' }),
    ).toBe(true);
    expect(
      isServiceModelCandidateAllowed(policy, { model: 'my-thinking-model', provider: 'custom' }),
    ).toBe(true);
  });

  it('filters only input completion denied models from provider groups', () => {
    const policy = getServiceModelPolicy('inputCompletion');

    expect(filterServiceModelCandidates(policy, providerGroups)).toEqual([
      {
        children: [
          { abilities: { reasoning: true }, id: 'gpt-4o-mini' },
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
    ]);
  });

  it('resolves input completion fallback to the first non-denied model', () => {
    const policy = getServiceModelPolicy('inputCompletion');

    expect(resolveServiceModelFallback(policy, providerGroups)).toEqual({
      model: 'gpt-4o-mini',
      provider: 'openai',
    });
  });

  it('marks input completion as empty on invalid selection', () => {
    expect(getServiceModelPolicy('inputCompletion')?.invalidSelection).toBe('empty');
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
