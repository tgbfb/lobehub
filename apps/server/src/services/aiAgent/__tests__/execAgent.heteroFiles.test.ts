import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAgentService } from '../index';

const {
  mockMessageCreate,
  mockResolveAttachmentMetadata,
  mockSandboxCallTool,
  mockSpawnHeteroSandbox,
} = vi.hoisted(() => ({
  mockMessageCreate: vi.fn(),
  mockResolveAttachmentMetadata: vi.fn(),
  mockSandboxCallTool: vi.fn(),
  mockSpawnHeteroSandbox: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn().mockReturnValue(undefined),
  getTrustedClientTokenForSession: vi.fn().mockResolvedValue(undefined),
  isTrustedClientEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/libs/trpc/utils/internalJwt', () => ({
  signOperationJwt: vi.fn().mockResolvedValue('op-jwt'),
  signUserJWT: vi.fn().mockResolvedValue('user-jwt'),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(() => ({
    create: mockMessageCreate,
    query: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  })),
}));

const heteroAgentConfig = {
  agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
  chatConfig: {},
  files: [],
  id: 'agent-1',
  knowledgeBases: [],
  model: 'claude-code',
  plugins: [],
  provider: 'anthropic',
  systemRole: 'You are a helpful assistant',
};

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(() => ({
    getAgentConfig: vi.fn().mockResolvedValue(heteroAgentConfig),
    queryAgents: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('@/server/services/agent', () => ({
  AgentService: vi.fn().mockImplementation(() => ({
    getAgentConfig: vi.fn().mockResolvedValue(heteroAgentConfig),
  })),
}));

vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue([]),
  })),
}));

const topicMock = {
  create: vi.fn().mockResolvedValue({ id: 'topic-1', metadata: undefined }),
  findById: vi.fn().mockResolvedValue(undefined),
  updateMetadata: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(() => topicMock),
}));

vi.mock('@/database/models/thread', () => ({
  ThreadModel: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  })),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn().mockImplementation(() => ({
    getLobehubSkillManifests: vi.fn().mockResolvedValue([]),
    market: {
      creds: {
        get: vi.fn(),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    },
  })),
}));

vi.mock('@/server/services/heterogeneousAgent', () => ({
  HeterogeneousAgentService: vi.fn().mockImplementation(() => ({
    getHeterogeneousResumeSessionId: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@/server/services/heterogeneousAgent/sandboxRunner', () => ({
  spawnHeteroSandbox: mockSpawnHeteroSandbox,
}));

vi.mock('@/server/services/sandbox', () => ({
  createSandboxService: vi.fn(() => ({
    callTool: mockSandboxCallTool,
  })),
}));

vi.mock('@/server/services/file/resolveAttachments', () => ({
  resolveAttachmentMetadata: mockResolveAttachmentMetadata,
  resolveAttachmentsByFileIds: vi.fn().mockResolvedValue({
    fileList: [],
    imageList: [],
    orderedFileIds: [],
    videoList: [],
    warnings: [],
  }),
}));

vi.mock('@/server/services/agentRuntime', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(() => ({
    createOperation: vi.fn().mockResolvedValue({
      autoStarted: true,
      messageId: 'queue-msg-1',
      operationId: 'op-123',
      success: true,
    }),
  })),
}));

vi.mock('@/server/modules/Mecha', () => ({
  createServerAgentToolsEngine: vi.fn().mockReturnValue({
    generateToolsDetailed: vi.fn().mockReturnValue({ enabledToolIds: [], tools: [] }),
    getEnabledPluginManifests: vi.fn().mockReturnValue(new Map()),
  }),
  serverMessagesEngine: vi.fn().mockResolvedValue([{ content: 'test', role: 'user' }]),
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    isConfigured: false,
    queryDeviceList: vi.fn().mockResolvedValue([]),
  },
}));

describe('AiAgentService.execAgent - hetero early-exit file attachments', () => {
  let service: AiAgentService;
  const mockDb = {} as any;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    topicMock.create.mockResolvedValue({ id: 'topic-1', metadata: undefined });
    topicMock.findById.mockResolvedValue(undefined);
    topicMock.updateMetadata.mockResolvedValue(undefined);
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
    mockResolveAttachmentMetadata.mockResolvedValue([]);
    mockSandboxCallTool.mockResolvedValue({ success: true });
    mockSpawnHeteroSandbox.mockResolvedValue({});

    service = new AiAgentService(mockDb, userId);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const findUserMessageCreate = () =>
    mockMessageCreate.mock.calls.find((call) => call[0].role === 'user');

  it('should attach fileIds to the user message (SPA gateway device/sandbox mode)', async () => {
    // regression: the hetero early exit used to create the user message
    // without `files`, so images attached in device mode were never linked
    // via messagesFiles and disappeared after the optimistic message was
    // replaced by the server snapshot.
    await service.execAgent({
      agentId: 'agent-1',
      fileIds: ['file-1', 'file-2'],
      prompt: 'Look at this image',
    });

    const userCall = findUserMessageCreate();
    expect(userCall).toBeDefined();
    expect(userCall![0].files).toEqual(['file-1', 'file-2']);
  });

  it('should dedupe repeated fileIds (messagesFiles PK is fileId+messageId)', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      fileIds: ['file-1', 'file-1', 'file-2'],
      prompt: 'Look at this image',
    });

    const userCall = findUserMessageCreate();
    expect(userCall![0].files).toEqual(['file-1', 'file-2']);
  });

  it('should leave files undefined when no fileIds are provided', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      prompt: 'No attachments here',
    });

    const userCall = findUserMessageCreate();
    expect(userCall).toBeDefined();
    expect(userCall![0].files).toBeUndefined();
  });

  it('should leave files undefined when fileIds is an empty array', async () => {
    await service.execAgent({
      agentId: 'agent-1',
      fileIds: [],
      prompt: 'No attachments here',
    });

    const userCall = findUserMessageCreate();
    expect(userCall![0].files).toBeUndefined();
  });

  describe('image delivery to the dispatched CLI', () => {
    it('should resolve image attachments and pass imageList to the sandbox dispatch', async () => {
      mockResolveAttachmentMetadata.mockResolvedValue([
        {
          fileType: 'image/png',
          id: 'file-1',
          name: 'screenshot.png',
          size: 100,
          url: 'https://signed/file-1.png',
        },
        {
          fileType: 'application/pdf',
          id: 'file-2',
          name: 'doc.pdf',
          size: 200,
          url: 'https://signed/file-2.pdf',
        },
      ]);

      await service.execAgent({
        agentId: 'agent-1',
        fileIds: ['file-1', 'file-2'],
        prompt: 'Look at this image',
      });

      expect(mockSpawnHeteroSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          imageList: [{ id: 'file-1', url: 'https://signed/file-1.png' }],
        }),
      );
    });

    it('should pass imageList undefined when attachments contain no images', async () => {
      mockResolveAttachmentMetadata.mockResolvedValue([
        {
          fileType: 'application/pdf',
          id: 'file-2',
          name: 'doc.pdf',
          size: 200,
          url: 'https://signed/file-2.pdf',
        },
      ]);

      await service.execAgent({
        agentId: 'agent-1',
        fileIds: ['file-2'],
        prompt: 'Read this doc',
      });

      expect(mockSpawnHeteroSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ imageList: undefined }),
      );
    });

    it('should not block the run when attachment resolution fails', async () => {
      mockResolveAttachmentMetadata.mockRejectedValue(new Error('S3 down'));

      const result = await service.execAgent({
        agentId: 'agent-1',
        fileIds: ['file-1'],
        prompt: 'Look at this image',
      });

      expect(result.success).toBe(true);
      // Persistence is independent of URL resolution — files still attached.
      const userCall = findUserMessageCreate();
      expect(userCall![0].files).toEqual(['file-1']);
      expect(mockSpawnHeteroSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ imageList: undefined }),
      );
    });

    it('should not resolve attachments when no fileIds are provided', async () => {
      await service.execAgent({
        agentId: 'agent-1',
        prompt: 'No attachments here',
      });

      expect(mockResolveAttachmentMetadata).not.toHaveBeenCalled();
    });
  });

  describe('sandbox stop race', () => {
    it('should kill the sandbox command when stop was requested before commandId is persisted', async () => {
      mockSpawnHeteroSandbox.mockResolvedValue({ commandId: 'cmd-delayed' });
      topicMock.findById.mockImplementation(async () => {
        const seededRunningOperation = topicMock.updateMetadata.mock.calls.find(
          ([, metadata]) => metadata.runningOperation?.operationId,
        )?.[1].runningOperation;

        return {
          id: 'topic-1',
          metadata: {
            runningOperation: seededRunningOperation
              ? {
                  ...seededRunningOperation,
                  cancelRequestedAt: '2026-01-01T00:00:00.000Z',
                }
              : undefined,
          },
        };
      });

      await service.execAgent({
        agentId: 'agent-1',
        prompt: 'Run in sandbox',
      });

      await vi.waitFor(() => {
        expect(mockSandboxCallTool).toHaveBeenCalledWith('killCommand', {
          commandId: 'cmd-delayed',
        });
      });

      expect(topicMock.updateMetadata).toHaveBeenCalledWith(
        'topic-1',
        expect.objectContaining({
          runningOperation: expect.objectContaining({
            cancelRequestedAt: '2026-01-01T00:00:00.000Z',
            sandboxCommandId: 'cmd-delayed',
          }),
        }),
      );
    });
  });
});
