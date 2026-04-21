// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgentDocumentModel,
  buildDocumentFilename,
  extractMarkdownH1Title,
} from '@/database/models/agentDocuments';
import { TopicDocumentModel } from '@/database/models/topicDocument';
import type { LobeChatDatabase } from '@/database/type';

import { AgentDocumentsService } from './agentDocuments';

vi.mock('@/database/models/agentDocuments', () => ({
  AgentDocumentModel: vi.fn(),
  DocumentLoadPosition: {
    BEFORE_FIRST_USER: 'before_first_user',
  },
  buildDocumentFilename: vi.fn(),
  extractMarkdownH1Title: vi.fn((content: string) => ({ content })),
}));

vi.mock('@/database/models/topicDocument', () => ({
  TopicDocumentModel: vi.fn(),
}));

describe('AgentDocumentsService', () => {
  const db = {} as LobeChatDatabase;
  const userId = 'user-1';

  const mockModel = {
    associate: vi.fn(),
    create: vi.fn(),
    findByAgent: vi.fn(),
    findByDocumentIds: vi.fn(),
    findByFilename: vi.fn(),
    hasByAgent: vi.fn(),
    upsert: vi.fn(),
  };
  const mockTopicDocumentModel = {
    associate: vi.fn(),
    findByTopicId: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (AgentDocumentModel as any).mockImplementation(() => mockModel);
    (TopicDocumentModel as any).mockImplementation(() => mockTopicDocumentModel);
    vi.mocked(buildDocumentFilename).mockImplementation((title: string) => title);
    vi.mocked(extractMarkdownH1Title).mockImplementation((content: string) => ({ content }));
  });

  describe('createDocument', () => {
    it('should append a numeric suffix when the base filename already exists', async () => {
      mockModel.findByFilename
        .mockResolvedValueOnce({ id: 'existing-doc' })
        .mockResolvedValueOnce(undefined);
      mockModel.create.mockResolvedValue({ id: 'new-doc', filename: 'note-2' });

      const service = new AgentDocumentsService(db, userId);
      const result = await service.createDocument('agent-1', 'note', 'content');

      expect(mockModel.findByFilename).toHaveBeenNthCalledWith(1, 'agent-1', 'note');
      expect(mockModel.findByFilename).toHaveBeenNthCalledWith(2, 'agent-1', 'note-2');
      expect(mockModel.create).toHaveBeenCalledWith('agent-1', 'note-2', 'content', {
        title: 'note',
      });
      expect(result).toEqual({ id: 'new-doc', filename: 'note-2' });
    });

    it('should throw after too many filename collisions', async () => {
      mockModel.findByFilename.mockResolvedValue({ id: 'existing-doc' });

      const service = new AgentDocumentsService(db, userId);

      await expect(service.createDocument('agent-1', 'note', 'content')).rejects.toThrow(
        'Unable to generate a unique filename for "note" after 1000 attempts.',
      );
      expect(mockModel.create).not.toHaveBeenCalled();
    });

    it('should extract H1 from markdown content as the document title', async () => {
      vi.mocked(extractMarkdownH1Title).mockReturnValueOnce({
        content: 'body',
        title: 'My Title',
      });
      mockModel.findByFilename.mockResolvedValue(undefined);
      mockModel.create.mockResolvedValue({ id: 'new-doc', filename: 'My Title' });

      const service = new AgentDocumentsService(db, userId);
      await service.createDocument('agent-1', 'fallback', '# My Title\n\nbody');

      expect(vi.mocked(buildDocumentFilename)).toHaveBeenCalledWith('My Title');
      expect(mockModel.create).toHaveBeenCalledWith('agent-1', 'My Title', 'body', {
        title: 'My Title',
      });
    });
  });

  describe('createForTopic', () => {
    it('should create an agent document and associate the underlying document with the topic', async () => {
      mockModel.findByFilename.mockResolvedValue(undefined);
      mockModel.create.mockResolvedValue({
        documentId: 'documents-1',
        filename: 'note',
        id: 'agent-doc-1',
        title: 'note',
      });

      const service = new AgentDocumentsService(db, userId);
      const result = await service.createForTopic('agent-1', 'note', 'content', 'topic-1');

      expect(result).toEqual({
        documentId: 'documents-1',
        filename: 'note',
        id: 'agent-doc-1',
        title: 'note',
      });
      expect(mockTopicDocumentModel.associate).toHaveBeenCalledWith({
        documentId: 'documents-1',
        topicId: 'topic-1',
      });
    });
  });

  describe('listDocuments', () => {
    it('should return a list of documents with documentId, filename, id, and title', async () => {
      mockModel.findByAgent.mockResolvedValue([
        {
          content: 'c1',
          documentId: 'documents-1',
          filename: 'a.md',
          id: 'doc-1',
          policy: null,
          title: 'A',
        },
        {
          content: 'c2',
          documentId: 'documents-2',
          filename: 'b.md',
          id: 'doc-2',
          policy: null,
          title: 'B',
        },
      ]);

      const service = new AgentDocumentsService(db, userId);
      const result = await service.listDocuments('agent-1');

      expect(mockModel.findByAgent).toHaveBeenCalledWith('agent-1');
      expect(result).toEqual([
        {
          documentId: 'documents-1',
          filename: 'a.md',
          id: 'doc-1',
          loadPosition: undefined,
          title: 'A',
        },
        {
          documentId: 'documents-2',
          filename: 'b.md',
          id: 'doc-2',
          loadPosition: undefined,
          title: 'B',
        },
      ]);
    });
  });

  describe('listDocumentsForTopic', () => {
    it('should list only agent documents associated with the topic and preserve topic order', async () => {
      mockTopicDocumentModel.findByTopicId.mockResolvedValue([
        { id: 'documents-2', title: 'B' },
        { id: 'documents-1', title: 'A' },
      ]);
      mockModel.findByDocumentIds.mockResolvedValue([
        {
          documentId: 'documents-1',
          filename: 'a.md',
          id: 'agent-doc-1',
          policy: null,
          title: 'A',
        },
        {
          documentId: 'documents-2',
          filename: 'b.md',
          id: 'agent-doc-2',
          policy: null,
          title: 'B',
        },
      ]);

      const service = new AgentDocumentsService(db, userId);
      const result = await service.listDocumentsForTopic('agent-1', 'topic-1');

      expect(mockTopicDocumentModel.findByTopicId).toHaveBeenCalledWith('topic-1');
      expect(mockModel.findByDocumentIds).toHaveBeenCalledWith('agent-1', [
        'documents-2',
        'documents-1',
      ]);
      expect(result).toEqual([
        {
          documentId: 'documents-2',
          filename: 'b.md',
          id: 'agent-doc-2',
          loadPosition: undefined,
          title: 'B',
        },
        {
          documentId: 'documents-1',
          filename: 'a.md',
          id: 'agent-doc-1',
          loadPosition: undefined,
          title: 'A',
        },
      ]);
    });
  });

  describe('getDocumentByFilename', () => {
    it('should read a document by filename', async () => {
      mockModel.findByFilename.mockResolvedValue({
        content: 'hello',
        filename: 'note.md',
        id: 'doc-1',
        title: 'note',
      });

      const service = new AgentDocumentsService(db, userId);
      const result = await service.getDocumentByFilename('agent-1', 'note.md');

      expect(mockModel.findByFilename).toHaveBeenCalledWith('agent-1', 'note.md');
      expect(result).toEqual({
        content: 'hello',
        filename: 'note.md',
        id: 'doc-1',
        title: 'note',
      });
    });

    it('should return undefined when filename does not exist', async () => {
      mockModel.findByFilename.mockResolvedValue(undefined);

      const service = new AgentDocumentsService(db, userId);
      const result = await service.getDocumentByFilename('agent-1', 'missing.md');

      expect(result).toBeUndefined();
    });
  });

  describe('upsertDocumentByFilename', () => {
    it('should create or update a document by filename', async () => {
      mockModel.upsert.mockResolvedValue({ content: 'new', filename: 'f.md', id: 'doc-1' });

      const service = new AgentDocumentsService(db, userId);
      const result = await service.upsertDocumentByFilename({
        agentId: 'agent-1',
        content: 'new',
        filename: 'f.md',
      });

      expect(mockModel.upsert).toHaveBeenCalledWith('agent-1', 'f.md', 'new');
      expect(result).toEqual({ content: 'new', filename: 'f.md', id: 'doc-1' });
    });
  });

  describe('hasDocuments', () => {
    it('should use the model existence check', async () => {
      mockModel.hasByAgent.mockResolvedValue(true);

      const service = new AgentDocumentsService(db, userId);
      const result = await service.hasDocuments('agent-1');

      expect(mockModel.hasByAgent).toHaveBeenCalledWith('agent-1');
      expect(result).toBe(true);
    });
  });

  describe('associateDocument', () => {
    it('should delegate to agentDocumentModel.associate', async () => {
      mockModel.associate.mockResolvedValue({ id: 'ad-1' });

      const service = new AgentDocumentsService(db, userId);
      const result = await service.associateDocument('agent-1', 'doc-1');

      expect(mockModel.associate).toHaveBeenCalledWith({ agentId: 'agent-1', documentId: 'doc-1' });
      expect(result).toEqual({ id: 'ad-1' });
    });
  });
});
