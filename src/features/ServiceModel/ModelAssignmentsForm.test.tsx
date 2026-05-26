import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnabledProviderWithModels } from '@/types/aiProvider';

import ModelAssignmentsForm from './ModelAssignmentsForm';

interface ModelSelectProps {
  modelFilter?: (params: {
    model: EnabledProviderWithModels['children'][number];
    provider: EnabledProviderWithModels;
  }) => boolean;
  modelList?: EnabledProviderWithModels[];
  value?: { model: string; provider?: string };
}

const mocks = vi.hoisted(() => ({
  modelSelectProps: [] as ModelSelectProps[],
}));

const embeddingModelList: EnabledProviderWithModels[] = [
  {
    children: [
      {
        abilities: {},
        displayName: 'Text Embedding 3 Small',
        id: 'text-embedding-3-small',
      },
    ],
    id: 'openai',
    name: 'OpenAI',
    source: 'builtin',
  },
];

const systemAgentSettings = {
  agentMeta: { model: 'gpt-4o-mini', provider: 'openai' },
  followUpAction: { enabled: true, model: 'gpt-4o-mini', provider: 'openai' },
  generationTopic: { model: 'gpt-4o-mini', provider: 'openai' },
  historyCompress: { model: 'gpt-4o-mini', provider: 'openai' },
  inputCompletion: { enabled: true, model: 'gpt-4o-mini', provider: 'openai' },
  memoryAnalysisAgentConfig: { contextLimit: 1024, model: 'gpt-4o-mini', provider: 'openai' },
  promptRewrite: { enabled: true, model: 'gpt-4o-mini', provider: 'openai' },
  topic: { model: 'gpt-4o-mini', provider: 'openai' },
  translation: { model: 'gpt-4o-mini', provider: 'openai' },
  userMemoryEmbedding: { contextLimit: 1024, model: 'text-embedding-3-small', provider: 'openai' },
  userMemoryPersonaWriter: { contextLimit: 1024, model: 'gpt-4o-mini', provider: 'openai' },
};

const renderFormItems = (items?: { children?: ReactNode }[]): ReactNode =>
  items?.map((item, index) => {
    if (Array.isArray(item.children)) {
      return <div key={index}>{renderFormItems(item.children as { children?: ReactNode }[])}</div>;
    }

    return <div key={index}>{item.children}</div>;
  });

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Form: ({ items }: { items?: { children?: ReactNode }[] }) => (
    <form>{renderFormItems(items)}</form>
  ),
  Icon: () => null,
  InputNumber: () => null,
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('antd', () => ({
  Switch: () => null,
}));

vi.mock('lucide-react', () => ({
  Loader2Icon: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/const/layoutTokens', () => ({
  FORM_STYLE: {},
}));

vi.mock('@/features/ModelSelect', () => ({
  default: (props: ModelSelectProps) => {
    mocks.modelSelectProps.push(props);

    return <div data-testid="model-select" />;
  },
}));

vi.mock('@/hooks/useEnabledEmbeddingModels', () => ({
  useEnabledEmbeddingModels: () => embeddingModelList,
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      isUserStateInit: true,
      updateDefaultAgent: vi.fn(),
      updateSystemAgent: vi.fn(),
    }),
}));

vi.mock('@/store/user/selectors', () => ({
  settingsSelectors: {
    currentSystemAgent: () => systemAgentSettings,
    defaultAgent: () => ({ config: { model: 'default-agent', provider: 'openai' } }),
  },
}));

beforeEach(() => {
  mocks.modelSelectProps.length = 0;
});

describe('<ModelAssignmentsForm />', () => {
  it('applies service model policy props without restricting the default assistant selector', () => {
    render(<ModelAssignmentsForm />);

    expect(screen.getAllByTestId('model-select').length).toBeGreaterThan(0);

    const defaultAgentSelect = mocks.modelSelectProps.find(
      (props) => props.value?.model === 'default-agent',
    );
    expect(defaultAgentSelect?.modelFilter).toBeUndefined();
    expect(defaultAgentSelect?.modelList).toBeUndefined();

    const inputCompletionSelect = mocks.modelSelectProps.find(
      (props) => props.value === systemAgentSettings.inputCompletion,
    );
    expect(inputCompletionSelect?.modelFilter).toBeTypeOf('function');
    expect(
      inputCompletionSelect?.modelFilter?.({
        model: { abilities: {}, id: 'gpt-5.4-pro' },
        provider: { children: [], id: 'openai', name: 'OpenAI', source: 'builtin' },
      }),
    ).toBe(false);
    expect(
      inputCompletionSelect?.modelFilter?.({
        model: { abilities: {}, id: 'gpt-5.4' },
        provider: { children: [], id: 'openai', name: 'OpenAI', source: 'builtin' },
      }),
    ).toBe(true);

    const userMemoryEmbeddingSelect = mocks.modelSelectProps.find(
      (props) => props.value === systemAgentSettings.userMemoryEmbedding,
    );
    expect(userMemoryEmbeddingSelect?.modelList?.[0]?.children[0]?.id).toBe(
      'text-embedding-3-small',
    );
  });
});
