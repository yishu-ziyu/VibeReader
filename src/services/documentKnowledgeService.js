import { createUniRagHttpAdapter } from './ragEngineAdapter';
import { savePersistentTask } from './persistentStorage';

export const KNOWLEDGE_INGEST_TASK_TYPE = 'knowledge_ingest';

const DOCUMENT_KNOWLEDGE_LINKS_KEY = 'vibereader.documentKnowledgeLinks';
const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_MAX_POLLS = 240;

function nowMs(value) {
    return typeof value === 'number' ? value : Date.now();
}

function stableHash(value = '') {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function textForDocument(document = {}) {
    if (document.contentText) return String(document.contentText);
    if (document.pdfText) return String(document.pdfText);
    if (document.text) return String(document.text);
    if (Array.isArray(document.pages)) {
        return document.pages
            .map((page, index) => {
                const pageNumber = page?.page || index + 1;
                const text = typeof page === 'string' ? page : page?.text;
                return text ? `--- 第 ${pageNumber} 页 ---\n${text}` : '';
            })
            .filter(Boolean)
            .join('\n\n');
    }
    return '';
}

function contentHashForDocument(document = {}) {
    return stableHash([
        document.id || '',
        document.fingerprint || '',
        document.size || '',
        textForDocument(document).slice(0, 500000),
    ].join('|'));
}

function readLinks() {
    if (typeof localStorage === 'undefined') return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(DOCUMENT_KNOWLEDGE_LINKS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function writeLinks(links = []) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(DOCUMENT_KNOWLEDGE_LINKS_KEY, JSON.stringify(links));
    } catch (_) {
        // Local storage may be unavailable in constrained browser contexts.
    }
}

function knowledgeIngestTaskId(documentId) {
    return `task-knowledge-ingest-${documentId}`;
}

function taskStatusForIngestStatus(status = '') {
    if (status === 'completed') return 'succeeded';
    if (status === 'failed') return 'failed';
    if (status === 'queued') return 'pending';
    return 'running';
}

function normalizeLink(input = {}) {
    const now = nowMs(input.updatedAt || input.ingestedAt || input.startedAt);
    return {
        readerDocumentId: input.readerDocumentId || input.documentId || '',
        readerFingerprint: input.readerFingerprint || null,
        uniRagJobId: input.uniRagJobId || input.jobId || null,
        uniRagStatusUrl: input.uniRagStatusUrl || input.statusUrl || null,
        uniRagSourceId: input.uniRagSourceId || input.sourceId || null,
        uniRagFilename: input.uniRagFilename || input.filename || '',
        contentHash: input.contentHash || '',
        status: input.status || 'unknown',
        percent: Number(input.percent || 0),
        message: input.message || '',
        error: input.error || null,
        startedAt: nowMs(input.startedAt || now),
        ingestedAt: typeof input.ingestedAt === 'number' ? input.ingestedAt : null,
        updatedAt: now,
    };
}

export function loadDocumentKnowledgeLink(documentId) {
    if (!documentId) return null;
    return readLinks().find((link) => link.readerDocumentId === documentId) || null;
}

export function isDocumentKnowledgeQueryReady(documentId) {
    const link = loadDocumentKnowledgeLink(documentId);
    return Boolean(
        link &&
        link.status === 'completed' &&
        (link.uniRagSourceId || link.uniRagFilename)
    );
}

export function saveDocumentKnowledgeLink(link = {}) {
    const normalized = normalizeLink(link);
    if (!normalized.readerDocumentId) return null;
    const links = readLinks().filter((item) => item.readerDocumentId !== normalized.readerDocumentId);
    const next = [normalized, ...links].slice(0, 500);
    writeLinks(next);
    return normalized;
}

function emitStatus(onStatus, status) {
    if (typeof onStatus === 'function') onStatus(Object.freeze({ ...status }));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

async function recordIngestTask(document, patch = {}) {
    if (!document?.id) return null;
    const now = nowMs(patch.updatedAt);
    return savePersistentTask({
        id: knowledgeIngestTaskId(document.id),
        documentId: document.id,
        type: KNOWLEDGE_INGEST_TASK_TYPE,
        title: '知识入库',
        payload: {
            documentId: document.id,
            documentName: document.name || document.title || 'Untitled',
            engine: 'uni-rag',
        },
        createdAt: nowMs(patch.createdAt || document.openedAt || now),
        updatedAt: now,
        ...patch,
    }).catch((error) => {
        console.warn('[documentKnowledgeService] Failed to record ingest task:', error);
        return null;
    });
}

export async function startDocumentKnowledgeIngest(options = {}) {
    const {
        document,
        adapter = createUniRagHttpAdapter(),
        onStatus,
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
        maxPolls = DEFAULT_MAX_POLLS,
        shouldContinue = () => true,
    } = options;

    if (!document?.id) {
        throw new Error('Document knowledge ingest requires a document with id.');
    }

    const contentHash = contentHashForDocument(document);
    const startedAt = Date.now();
    emitStatus(onStatus, {
        status: 'queued',
        percent: 1,
        message: '正在送入知识引擎',
        documentId: document.id,
    });
    await recordIngestTask(document, {
        status: 'pending',
        progress: 1,
        startedAt,
    });

    const start = await adapter.ingestDocument({ document });
    saveDocumentKnowledgeLink({
        readerDocumentId: document.id,
        readerFingerprint: document.fingerprint || null,
        uniRagJobId: start.jobId,
        uniRagStatusUrl: start.statusUrl,
        contentHash,
        status: 'queued',
        percent: 1,
        message: '已提交知识入库任务',
        startedAt,
        updatedAt: Date.now(),
    });

    await recordIngestTask(document, {
        status: 'running',
        progress: 5,
        startedAt,
        result: {
            jobId: start.jobId,
            statusUrl: start.statusUrl,
        },
    });

    let latest = null;
    for (let pollCount = 0; pollCount < maxPolls; pollCount += 1) {
        if (!shouldContinue()) return null;
        if (pollCount > 0 || pollIntervalMs > 0) {
            await sleep(pollIntervalMs);
        }
        if (!shouldContinue()) return null;

        latest = await adapter.getIngestStatus(start.jobId);
        const taskStatus = taskStatusForIngestStatus(latest.status);
        const completed = latest.status === 'completed';
        const failed = latest.status === 'failed';
        const updatedAt = Date.now();
        const link = saveDocumentKnowledgeLink({
            readerDocumentId: document.id,
            readerFingerprint: document.fingerprint || null,
            uniRagJobId: start.jobId,
            uniRagStatusUrl: start.statusUrl,
            uniRagSourceId: latest.result?.sourceId || null,
            uniRagFilename: latest.result?.filename || latest.filename || document.name || '',
            contentHash,
            status: latest.status,
            percent: latest.percent,
            message: latest.message,
            error: latest.error,
            startedAt,
            ingestedAt: completed ? updatedAt : null,
            updatedAt,
        });

        emitStatus(onStatus, {
            ...latest,
            documentId: document.id,
            link,
        });
        await recordIngestTask(document, {
            status: taskStatus,
            progress: Math.max(0, Math.min(100, Number(latest.percent || 0))),
            result: {
                jobId: start.jobId,
                statusUrl: start.statusUrl,
                sourceId: latest.result?.sourceId || null,
                filename: latest.result?.filename || latest.filename || '',
                chunks: latest.result?.chunks || 0,
                format: latest.result?.format || 'unknown',
            },
            errorMessage: latest.error || (failed ? latest.message : null),
            startedAt,
            completedAt: completed || failed ? updatedAt : null,
        });

        if (completed) return latest;
        if (failed) {
            throw new Error(latest.error || latest.message || 'UniRAG ingest failed.');
        }
    }

    throw new Error(`UniRAG ingest did not finish after ${maxPolls} polls.`);
}
