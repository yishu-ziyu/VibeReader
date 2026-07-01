import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    KNOWLEDGE_INGEST_TASK_TYPE,
    loadDocumentKnowledgeLink,
    saveDocumentKnowledgeLink,
    startDocumentKnowledgeIngest,
} from './documentKnowledgeService';
import { savePersistentTask } from './persistentStorage';

vi.mock('./persistentStorage', () => ({
    savePersistentTask: vi.fn(async (task) => task),
}));

const document = {
    id: 'doc-knowledge',
    name: 'Knowledge.pdf',
    kind: 'pdf',
    fingerprint: 'fp-1',
    openedAt: 100,
    contentText: 'A source-grounded reading document.',
};

describe('documentKnowledgeService', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(savePersistentTask).mockClear();
    });

    it('saves and loads a DocumentKnowledgeLink', () => {
        const link = saveDocumentKnowledgeLink({
            readerDocumentId: 'doc-1',
            uniRagJobId: 'job-1',
            uniRagSourceId: 'source-1',
            uniRagFilename: 'paper.pdf',
            status: 'completed',
            percent: 100,
        });

        expect(link).toEqual(expect.objectContaining({
            readerDocumentId: 'doc-1',
            uniRagJobId: 'job-1',
            uniRagSourceId: 'source-1',
            uniRagFilename: 'paper.pdf',
            status: 'completed',
        }));
        expect(loadDocumentKnowledgeLink('doc-1')).toEqual(expect.objectContaining({
            uniRagSourceId: 'source-1',
        }));
    });

    it('starts document ingest, polls status, records task state, and stores the link', async () => {
        const adapter = {
            ingestDocument: vi.fn(async () => ({
                jobId: 'job-123',
                statusUrl: '/api/ingest/jobs/job-123',
            })),
            getIngestStatus: vi.fn(async () => ({
                jobId: 'job-123',
                status: 'completed',
                step: 'done',
                percent: 100,
                message: '入库完成，可以开始提问。',
                filename: 'Knowledge.pdf',
                result: {
                    sourceId: 'source-123',
                    chunks: 4,
                    format: 'pdf',
                    filename: 'Knowledge.pdf',
                },
                error: null,
            })),
        };
        const seenStatuses = [];

        const result = await startDocumentKnowledgeIngest({
            document,
            adapter,
            pollIntervalMs: 0,
            onStatus: (status) => seenStatuses.push(status),
        });

        expect(adapter.ingestDocument).toHaveBeenCalledWith({ document });
        expect(adapter.getIngestStatus).toHaveBeenCalledWith('job-123');
        expect(result.status).toBe('completed');
        expect(seenStatuses.map((status) => status.status)).toEqual(['queued', 'completed']);
        expect(loadDocumentKnowledgeLink(document.id)).toEqual(expect.objectContaining({
            readerDocumentId: document.id,
            uniRagJobId: 'job-123',
            uniRagSourceId: 'source-123',
            status: 'completed',
            percent: 100,
        }));
        expect(savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            id: 'task-knowledge-ingest-doc-knowledge',
            documentId: document.id,
            type: KNOWLEDGE_INGEST_TASK_TYPE,
            status: 'succeeded',
            progress: 100,
        }));
    });

    it('records failed ingest status and surfaces the error', async () => {
        const adapter = {
            ingestDocument: vi.fn(async () => ({
                jobId: 'job-failed',
                statusUrl: '/api/ingest/jobs/job-failed',
            })),
            getIngestStatus: vi.fn(async () => ({
                jobId: 'job-failed',
                status: 'failed',
                step: 'failed',
                percent: 100,
                message: '入库失败',
                filename: 'Knowledge.pdf',
                result: null,
                error: 'parse failed',
            })),
        };

        await expect(startDocumentKnowledgeIngest({
            document,
            adapter,
            pollIntervalMs: 0,
        })).rejects.toThrow('parse failed');

        expect(loadDocumentKnowledgeLink(document.id)).toEqual(expect.objectContaining({
            status: 'failed',
            error: 'parse failed',
        }));
        expect(savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            type: KNOWLEDGE_INGEST_TASK_TYPE,
            status: 'failed',
            errorMessage: 'parse failed',
        }));
    });
});
