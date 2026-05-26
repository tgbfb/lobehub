import type { SystemAgentItem } from '@lobechat/types';
import { describe, expect, it } from 'vitest';

import type { EnabledProviderWithModels } from '@/types/aiProvider';

import { resolveClientServiceModelConfig } from './client';

const chatList = [
  {
    children: [{ id: 'gpt-4o-mini' }, { id: 'gpt-5.4-pro' }],
    id: 'openai',
    name: 'OpenAI',
    source: 'builtin',
  },
] as EnabledProviderWithModels[];

const embeddingList = [
  {
    children: [{ id: 'text-embedding-3-small' }],
    id: 'openai',
    name: 'OpenAI',
    source: 'builtin',
  },
] as EnabledProviderWithModels[];

describe('resolveClientServiceModelConfig', () => {
  it('keeps a valid saved input completion model', () => {
    const config = {
      model: 'gpt-4o-mini',
      provider: 'openai',
    } satisfies SystemAgentItem;

    expect(resolveClientServiceModelConfig('inputCompletion', config, { chatList })).toEqual({
      model: 'gpt-4o-mini',
      provider: 'openai',
    });
  });

  it('falls back when the saved input completion model is invalid', () => {
    const config = {
      model: 'gpt-5.4-pro',
      provider: 'openai',
    } satisfies SystemAgentItem;

    expect(resolveClientServiceModelConfig('inputCompletion', config, { chatList })).toEqual({
      model: 'gpt-4o-mini',
      provider: 'openai',
    });
  });

  it('returns undefined for input completion when no allowed model exists', () => {
    const config = {
      model: 'gpt-5.4-pro',
      provider: 'openai',
    } satisfies SystemAgentItem;
    const disallowedChatList = [
      {
        children: [{ id: 'gpt-5.4-pro' }],
        id: 'openai',
        name: 'OpenAI',
        source: 'builtin',
      },
    ] as EnabledProviderWithModels[];

    expect(
      resolveClientServiceModelConfig('inputCompletion', config, {
        chatList: disallowedChatList,
      }),
    ).toBeUndefined();
  });

  it('uses embedding candidates for user memory embedding fallback', () => {
    const config = {
      model: 'gpt-5-thinking',
      provider: 'openai',
    } satisfies SystemAgentItem;

    expect(
      resolveClientServiceModelConfig('userMemoryEmbedding', config, {
        chatList,
        embeddingList,
      }),
    ).toEqual({
      model: 'text-embedding-3-small',
      provider: 'openai',
    });
  });
});
