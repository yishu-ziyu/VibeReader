import React from 'react';
import { Modal } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationStore, useDocumentStore, usePdfStore, useUIStore, useVibeStore } from './store';

const mockListPersistentDocuments = vi.hoisted(() => vi.fn(async () => []));
const mockLoadPersistentDocumentContent = vi.hoisted(() => vi.fn(async () => null));
const mockSavePersistentDocumentContent = vi.hoisted(() => vi.fn(async (documentId, contentText) => ({
    documentId,
    contentText,
})));
const documentServiceMock = vi.hoisted(() => ({
    fileToDocument: vi.fn(),
    fileToDocumentWithContent: vi.fn(),
    openTauriDocument: vi.fn(),
}));
const sourceIndexServiceMock = vi.hoisted(() => ({
    buildIndexedRetrievalContext: vi.fn(async () => null),
    indexDocumentSourceSpans: vi.fn(async () => []),
}));
const ragEngineAdapterMock = vi.hoisted(() => ({
    createUniRagHttpAdapter: vi.fn(() => ({
        health: vi.fn(async () => ({
            available: true,
            engine: 'uni-rag',
            adapter: 'uni-rag',
            degraded: false,
            baseUrl: 'http://127.0.0.1:8766',
        })),
    })),
}));
const documentKnowledgeServiceMock = vi.hoisted(() => ({
    loadDocumentKnowledgeLink: vi.fn(() => null),
    startDocumentKnowledgeIngest: vi.fn(async ({ document, onStatus }) => {
        onStatus?.({
            status: 'running',
            documentId: document?.id,
            percent: 42,
            message: '正在送入知识引擎',
        });
        return {
            status: 'running',
            documentId: document?.id,
            percent: 42,
        };
    }),
}));
const artifactServiceMock = vi.hoisted(() => ({
    createArtifact: vi.fn(async (artifact) => artifact),
    listArtifactsForDocument: vi.fn(async () => []),
    updateArtifact: vi.fn(async (id, patch) => ({ id, ...patch })),
    deleteArtifact: vi.fn(async () => true),
}));
const agentMock = vi.hoisted(() => ({
    DEFAULT_READING_PERMISSIONS: {
        allowedTools: [
            'get_current_document',
            'get_document_chunks',
            'get_page_text',
            'search_document',
            'list_attention_insights',
            'extractText',
            'navigatePage',
            'listAnnotations',
        ],
        canReadDocument: true,
        canSearchDocument: true,
        canListAttentionInsights: true,
        canNavigate: true,
        canListAnnotations: true,
        canWriteAnnotations: false,
        canWriteVibeCards: false,
        canExportNotes: false,
        canUseWeb: false,
    },
    buildReadingAgentTask: vi.fn((type, document, overrides = {}) => ({
        documentId: document?.id || null,
        type,
        title: type === 'attention_agent'
            ? 'Attention route'
            : type === 'card_generation_agent'
                ? 'Create VibeCard'
                : 'Paper overview',
        payload: {
            agentOptions: {
                taskType: type,
                documentId: document?.id || null,
                goal: overrides.goal || (type === 'attention_agent'
                    ? 'Identify the most important source-grounded reading positions and rank them as a short reading route.'
                    : type === 'card_generation_agent'
                        ? 'Generate source-grounded VibeCards from the current document without inventing unsupported claims.'
                    : 'Create a concise paper overview for the current document using safe metadata and bounded source chunks.'),
                maxIterations: type === 'card_generation_agent' ? 6 : 4,
                skillPath: type === 'attention_agent'
                    ? 'docs/reading-agent-skills/attention-route.md'
                    : type === 'card_generation_agent'
                        ? 'docs/reading-agent-skills/card-generation.md'
                    : 'docs/reading-agent-skills/paper-overview.md',
                requiredTools: type === 'attention_agent'
                    ? [
                        'get_current_document',
                        'get_document_chunks',
                        'list_attention_insights',
                    ]
                    : type === 'card_generation_agent'
                        ? [
                            'get_current_document',
                            'get_document_chunks',
                            'create_vibecard',
                        ]
                    : [
                        'get_current_document',
                        'get_document_chunks',
                    ],
                outputArtifactType: type === 'attention_agent'
                    ? 'attention_insights'
                    : type === 'card_generation_agent'
                        ? 'vibecard'
                        : 'reading_note',
            },
        },
    })),
    createReadingTools: vi.fn((baseContext = {}, adapters = {}) => ({
        get_current_document: { run: vi.fn() },
        get_document_chunks: { run: vi.fn() },
        list_attention_insights: { run: vi.fn() },
        create_vibecard: {
            run: vi.fn(async (args = {}) => {
                if (!adapters.createVibeCard) {
                    throw new Error('missing createVibeCard adapter');
                }
                const documentId = args.documentId || baseContext.document?.id || null;
                const card = await adapters.createVibeCard({
                    documentId,
                    ...(args.card || {}),
                });
                return {
                    documentId,
                    cardId: card?.id || null,
                    status: 'created',
                    card,
                };
            }),
        },
    })),
    createLocalAttentionRouteModel: vi.fn(() => vi.fn(async () => ({
        type: 'final',
        content: '# Attention route',
        sourceRefs: [],
    }))),
    createLocalPaperOverviewModel: vi.fn(() => vi.fn(async () => ({
        type: 'final',
        content: '# Paper overview',
        sourceRefs: [],
    }))),
    createLocalCardGenerationModel: vi.fn(() => vi.fn(async () => ({
        type: 'final',
        content: '# Created VibeCards',
        sourceRefs: [],
    }))),
    generateLensCardArtifact: vi.fn(),
    getReadingAgentSkill: vi.fn((type) => {
        if (type === 'attention_agent') {
            return {
                type: 'attention_agent',
                title: 'Attention route',
                goal: 'Identify the most important source-grounded reading positions and rank them as a short reading route.',
                maxIterations: 4,
            };
        }
        if (type === 'card_generation_agent') {
            return {
                type: 'card_generation_agent',
                title: 'Create VibeCard',
                goal: 'Generate source-grounded VibeCards from the current document without inventing unsupported claims.',
                maxIterations: 6,
            };
        }
        return {
            type: 'paper_overview_agent',
            title: 'Paper overview',
            goal: 'Create a concise paper overview for the current document using safe metadata and bounded source chunks.',
            maxIterations: 4,
        };
    }),
    listReadingAgentSkills: vi.fn(() => [
        {
            type: 'paper_overview_agent',
            title: 'Paper overview',
            goal: 'Create a concise paper overview for the current document using safe metadata and bounded source chunks.',
            maxIterations: 4,
        },
        {
            type: 'attention_agent',
            title: 'Attention route',
            goal: 'Identify the most important source-grounded reading positions and rank them as a short reading route.',
            maxIterations: 4,
        },
        {
            type: 'card_generation_agent',
            title: 'Create VibeCard',
            goal: 'Generate source-grounded VibeCards from the current document without inventing unsupported claims.',
            maxIterations: 6,
        },
    ]),
    retryReadingAgentTask: vi.fn(async () => ({ status: 'succeeded' })),
    runReadingAgentTask: vi.fn(async () => ({ status: 'succeeded' })),
}));
const taskStatusPanelMock = vi.hoisted(() => ({
    lastProps: null,
}));
const artifactPanelMock = vi.hoisted(() => ({
    lastProps: null,
}));

vi.mock('./storage', () => ({
    deleteConversation: vi.fn().mockResolvedValue(true),
    getFontScale: vi.fn(() => 1),
    getModelConfigs: vi.fn(() => []),
    getSelectedConfigId: vi.fn(() => null),
    listConversations: vi.fn().mockResolvedValue([]),
    loadConversation: vi.fn().mockResolvedValue(null),
    saveConversation: vi.fn().mockResolvedValue(true),
    setFontScale: vi.fn(),
    setSelectedConfigId: vi.fn(),
    saveModelConfigs: vi.fn(() => true),
}));

vi.mock('./aiService', () => ({
    default: {
        addMessage: vi.fn(),
        chatStream: vi.fn(),
        clearHistory: vi.fn(),
        setConfig: vi.fn(),
        setPaperContext: vi.fn(),
    },
}));

vi.mock('./pdfService', () => ({
    extractTextFromPDF: vi.fn(),
}));

vi.mock('./services/documentService', () => ({
    SUPPORTED_DOCUMENT_EXTENSIONS: ['.pdf', '.md', '.txt'],
    fileToDocument: documentServiceMock.fileToDocument,
    fileToDocumentWithContent: documentServiceMock.fileToDocumentWithContent,
    openTauriDocument: documentServiceMock.openTauriDocument,
}));

vi.mock('./services/artifactService', () => ({
    createArtifact: artifactServiceMock.createArtifact,
    listArtifactsForDocument: artifactServiceMock.listArtifactsForDocument,
    updateArtifact: artifactServiceMock.updateArtifact,
    deleteArtifact: artifactServiceMock.deleteArtifact,
}));

vi.mock('./services/persistentStorage', () => ({
    initializePersistentStorage: vi.fn(async () => ({ initialized: true, path: '/tmp/test.sqlite3' })),
    listPersistentAttentionInsights: vi.fn(async () => []),
    listPersistentDocuments: mockListPersistentDocuments,
    loadPersistentDocumentContent: mockLoadPersistentDocumentContent,
    savePersistentDocument: vi.fn(async (document) => document),
    savePersistentDocumentContent: mockSavePersistentDocumentContent,
}));

vi.mock('./services/sourceIndexService', () => sourceIndexServiceMock);

vi.mock('./services/ragEngineAdapter', () => ({
    DEFAULT_UNI_RAG_BASE_URL: 'http://127.0.0.1:8766',
    createUniRagHttpAdapter: ragEngineAdapterMock.createUniRagHttpAdapter,
}));

vi.mock('./services/documentKnowledgeService', () => ({
    KNOWLEDGE_INGEST_TASK_TYPE: 'knowledge_ingest',
    loadDocumentKnowledgeLink: documentKnowledgeServiceMock.loadDocumentKnowledgeLink,
    startDocumentKnowledgeIngest: documentKnowledgeServiceMock.startDocumentKnowledgeIngest,
}));

vi.mock('./agent', () => agentMock);

vi.mock('@ant-design/x', () => ({
    Bubble: ({ content }) => content,
}));

vi.mock('./ThinkingTreePanel', () => ({
    ThinkingTreePanel: () => <div data-testid="mock-skim-map-panel">Skim Map</div>,
    default: () => <div data-testid="mock-skim-map-panel">Skim Map</div>,
}));

vi.mock('./ChatInput', () => ({
    default: () => <div className="mock-chat-input" />,
}));

vi.mock('./PdfViewer', () => ({
    PdfViewer: () => <div data-testid="mock-pdf-viewer" />,
}));

vi.mock('./ArtifactPanel', () => ({
    ArtifactPanel: (props) => {
        artifactPanelMock.lastProps = props;
        return <div data-testid="mock-artifact-panel" />;
    },
    default: (props) => {
        artifactPanelMock.lastProps = props;
        return <div data-testid="mock-artifact-panel" />;
    },
}));

vi.mock('./TaskStatusPanel', () => ({
    TaskStatusPanel: (props) => {
        taskStatusPanelMock.lastProps = props;
        return (
            <div data-testid="mock-task-status-panel">
                <button
                    type="button"
                    onClick={() => props.onRetryTask?.({
                        id: 'task-source-index-doc-opened-md',
                        documentId: 'doc-opened-md',
                        type: 'source_index',
                        status: 'failed',
                    })}
                >
                    Retry mocked source index
                </button>
                <button
                    type="button"
                    onClick={() => props.onRetryTask?.({
                        id: 'task-agent-doc-opened-md',
                        documentId: 'doc-opened-md',
                        type: 'paper_overview_agent',
                        status: 'failed',
                        payloadJson: JSON.stringify({
                            agentOptions: {
                                goal: 'Retry overview.',
                            },
                        }),
                    })}
                >
                    Retry mocked agent
                </button>
                <button
                    type="button"
                    onClick={() => props.onStartAgentTask?.('paper_overview_agent')}
                >
                    Start mocked paper overview
                </button>
                <button
                    type="button"
                    onClick={() => props.onStartAgentTask?.('attention_agent')}
                >
                    Start mocked attention route
                </button>
                <button
                    type="button"
                    onClick={() => props.onStartAgentTask?.('card_generation_agent')}
                >
                    Start mocked create vibecard
                </button>
                <button
                    type="button"
                    onClick={() => props.onSaveTaskResult?.({
                        id: 'task-agent-overview-doc-opened-md',
                        documentId: 'doc-opened-md',
                        type: 'paper_overview_agent',
                        status: 'succeeded',
                        title: 'Paper overview',
                        result: {
                            content: '# Paper overview\n\nImportant source-backed finding.',
                            sourceRefs: [
                                {
                                    documentId: 'doc-opened-md',
                                    page: 2,
                                    paragraphId: 'page-2-para-0',
                                    text: 'Important source-backed finding.',
                                },
                            ],
                        },
                    })}
                >
                    Save mocked task result
                </button>
            </div>
        );
    },
    default: (props) => {
        taskStatusPanelMock.lastProps = props;
        return (
            <div data-testid="mock-task-status-panel">
                <button
                    type="button"
                    onClick={() => props.onRetryTask?.({
                        id: 'task-source-index-doc-opened-md',
                        documentId: 'doc-opened-md',
                        type: 'source_index',
                        status: 'failed',
                    })}
                >
                    Retry mocked source index
                </button>
                <button
                    type="button"
                    onClick={() => props.onRetryTask?.({
                        id: 'task-agent-doc-opened-md',
                        documentId: 'doc-opened-md',
                        type: 'paper_overview_agent',
                        status: 'failed',
                        payloadJson: JSON.stringify({
                            agentOptions: {
                                goal: 'Retry overview.',
                            },
                        }),
                    })}
                >
                    Retry mocked agent
                </button>
                <button
                    type="button"
                    onClick={() => props.onStartAgentTask?.('paper_overview_agent')}
                >
                    Start mocked paper overview
                </button>
                <button
                    type="button"
                    onClick={() => props.onStartAgentTask?.('attention_agent')}
                >
                    Start mocked attention route
                </button>
                <button
                    type="button"
                    onClick={() => props.onStartAgentTask?.('card_generation_agent')}
                >
                    Start mocked create vibecard
                </button>
                <button
                    type="button"
                    onClick={() => props.onSaveTaskResult?.({
                        id: 'task-agent-overview-doc-opened-md',
                        documentId: 'doc-opened-md',
                        type: 'paper_overview_agent',
                        status: 'succeeded',
                        title: 'Paper overview',
                        result: {
                            content: '# Paper overview\n\nImportant source-backed finding.',
                            sourceRefs: [
                                {
                                    documentId: 'doc-opened-md',
                                    page: 2,
                                    paragraphId: 'page-2-para-0',
                                    text: 'Important source-backed finding.',
                                },
                            ],
                        },
                    })}
                >
                    Save mocked task result
                </button>
            </div>
        );
    },
}));

function resetStores() {
    useConversationStore.setState({
        messages: [],
        currentSessionId: null,
        sessions: [],
        loading: false,
        historyLoaded: true,
    });
    useDocumentStore.getState().clearDocuments();
    usePdfStore.getState().clearPdf();
    useUIStore.setState({ rightToolTab: 'chat', workspaceSplitRatio: 0.58 });
    useVibeStore.getState().clearVibeData();
}

describe('Workspace layout', () => {
    beforeEach(() => {
        localStorage.clear();
        mockListPersistentDocuments.mockResolvedValue([]);
        mockLoadPersistentDocumentContent.mockReset();
        mockLoadPersistentDocumentContent.mockResolvedValue(null);
        mockSavePersistentDocumentContent.mockClear();
        documentServiceMock.fileToDocument.mockReset();
        documentServiceMock.fileToDocumentWithContent.mockReset();
        documentServiceMock.openTauriDocument.mockReset();
        sourceIndexServiceMock.buildIndexedRetrievalContext.mockClear();
        sourceIndexServiceMock.indexDocumentSourceSpans.mockClear();
        ragEngineAdapterMock.createUniRagHttpAdapter.mockClear();
        documentKnowledgeServiceMock.loadDocumentKnowledgeLink.mockClear();
        documentKnowledgeServiceMock.startDocumentKnowledgeIngest.mockClear();
        artifactServiceMock.createArtifact.mockClear();
        artifactServiceMock.listArtifactsForDocument.mockClear();
        artifactServiceMock.updateArtifact.mockClear();
        artifactServiceMock.deleteArtifact.mockClear();
        agentMock.createReadingTools.mockClear();
        agentMock.createLocalAttentionRouteModel.mockClear();
        agentMock.createLocalCardGenerationModel.mockClear();
        agentMock.createLocalPaperOverviewModel.mockClear();
        agentMock.generateLensCardArtifact.mockClear();
        agentMock.retryReadingAgentTask.mockClear();
        agentMock.runReadingAgentTask.mockClear();
        vi.spyOn(Modal, 'confirm').mockImplementation((options = {}) => {
            options.onOk?.();
            return { destroy: vi.fn(), update: vi.fn() };
        });
        taskStatusPanelMock.lastProps = null;
        artifactPanelMock.lastProps = null;
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        resetStores();
        document.body.innerHTML = '<div id="root"></div>';
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        resetStores();
        document.body.innerHTML = '';
    });

    it('embeds Skim Map as the left margin of the reading surface and keeps Lens Cards under Notes', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        await screen.findByText('工作台');

        const readingSurface = document.querySelector('.workspace-reading-surface');
        const skimMap = document.querySelector('.workspace-skim-map-pane[aria-label="阅读地图"]');
        const reader = document.querySelector('.workspace-reader-pane');
        const notesTab = screen.getByText(/Notes|笔记/).closest('[role="tab"]');
        const tasksTab = screen.queryByText('任务');

        expect(readingSurface).toBeTruthy();
        expect(skimMap).toBeTruthy();
        expect(reader).toBeTruthy();
        expect(notesTab).toBeTruthy();
        expect(tasksTab).toBeNull();
        expect(screen.queryByText('Artifacts')).toBeNull();
        expect(readingSurface.contains(skimMap)).toBe(true);
        expect(readingSurface.contains(reader)).toBe(true);
        expect(skimMap.compareDocumentPosition(reader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows recent persisted documents in the sidebar without opening them as the active reader', async () => {
        mockListPersistentDocuments.mockResolvedValue([
            {
                id: 'doc-recent',
                name: 'Saved Paper.pdf',
                kind: 'pdf',
                openedAt: 200,
            },
        ]);

        const { App } = await import('./App.jsx');
        render(<App />);

        await screen.findByText('最近文档');
        expect(screen.getByText('Saved Paper.pdf')).toBeTruthy();
        expect(useDocumentStore.getState().currentDocument).toBeNull();
    });

    it('indexes a readable document after it is opened into the workspace', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The identification strategy uses matched controls.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        expect(input).toBeTruthy();
        fireEvent.change(input, {
            target: {
                files: [new File(['# Methods'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'doc-opened-md',
                    contentText: expect.stringContaining('identification strategy'),
                })
            );
        });
    });

    it('starts visible UniRAG knowledge ingest after a readable document is opened', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The identification strategy uses matched controls.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Methods'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await screen.findByText('知识入库：42%');
        expect(documentKnowledgeServiceMock.startDocumentKnowledgeIngest).toHaveBeenCalledWith(
            expect.objectContaining({
                document: expect.objectContaining({
                    id: 'doc-opened-md',
                    contentText: expect.stringContaining('identification strategy'),
                }),
            })
        );
    });

    it('persists readable document content after it is opened into the workspace', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The identification strategy uses matched controls.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Methods'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(mockSavePersistentDocumentContent).toHaveBeenCalledWith(
                'doc-opened-md',
                'The identification strategy uses matched controls.',
                expect.objectContaining({
                    sourceType: 'markdown',
                    createdAt: 100,
                })
            );
        });
    });

    it('restores a recent readable document from persisted content before opening it', async () => {
        mockListPersistentDocuments.mockResolvedValue([
            {
                id: 'doc-recent-md',
                name: 'Saved.md',
                kind: 'markdown',
                source: 'browser-upload',
                openedAt: 200,
                parseStatus: 'parsed',
            },
        ]);
        mockLoadPersistentDocumentContent.mockResolvedValue({
            documentId: 'doc-recent-md',
            contentText: '# Saved\n\nPersisted body about controls.',
            sourceType: 'markdown',
            createdAt: 100,
            updatedAt: 200,
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        await screen.findByText('Saved.md');
        fireEvent.click(screen.getByText('Saved.md'));

        await waitFor(() => {
            expect(useDocumentStore.getState().currentDocument).toEqual(expect.objectContaining({
                id: 'doc-recent-md',
                contentText: expect.stringContaining('Persisted body'),
                isRecentOnly: false,
            }));
        });
        expect(mockLoadPersistentDocumentContent).toHaveBeenCalledWith('doc-recent-md');
        expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'doc-recent-md',
                contentText: expect.stringContaining('Persisted body'),
            })
        );
    });

    it('passes the current document name to the Notes export panel', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The identification strategy uses matched controls.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        expect(input).toBeTruthy();
        fireEvent.change(input, {
            target: {
                files: [new File(['# Methods'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(useDocumentStore.getState().currentDocument?.name).toBe('opened.md');
        });

        fireEvent.click(screen.getByText(/Notes|笔记/));
        await screen.findByTestId('mock-artifact-panel');

        expect(artifactPanelMock.lastProps).toEqual(expect.objectContaining({
            documentId: 'doc-opened-md',
            documentName: 'opened.md',
        }));
    });

    it('refreshes recent documents and current Notes after Reading Note JSON import', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The identification strategy uses matched controls.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Methods'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(useDocumentStore.getState().currentDocument?.id).toBe('doc-opened-md');
        });
        fireEvent.click(screen.getByText(/Notes|笔记/));
        await screen.findByTestId('mock-artifact-panel');
        artifactServiceMock.listArtifactsForDocument.mockClear();
        artifactServiceMock.listArtifactsForDocument.mockResolvedValueOnce([
            {
                id: 'imported-card',
                documentId: 'doc-opened-md',
                type: 'concept_card',
                goal: 'Imported card',
            },
        ]);
        mockListPersistentDocuments.mockResolvedValueOnce([
            {
                id: 'doc-opened-md',
                name: 'opened.md',
                kind: 'markdown',
                openedAt: 100,
            },
        ]);

        await artifactPanelMock.lastProps.onReadingNoteImported({
            document: { id: 'doc-opened-md' },
        });

        expect(mockListPersistentDocuments).toHaveBeenCalled();
        expect(artifactServiceMock.listArtifactsForDocument).toHaveBeenCalledWith('doc-opened-md');
        await waitFor(() => {
            expect(artifactPanelMock.lastProps.artifacts).toEqual([
                expect.objectContaining({ id: 'imported-card' }),
            ]);
        });
    });

    it('retries failed source indexing tasks for the current document from the Tasks panel', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The identification strategy uses matched controls.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Methods'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalled();
        });
        sourceIndexServiceMock.indexDocumentSourceSpans.mockClear();

        fireEvent.click(await screen.findByText('Retry mocked source index'));

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'doc-opened-md',
                    contentText: expect.stringContaining('identification strategy'),
                })
            );
        });
    });

    it('retries failed agent tasks for the current document from the Tasks panel', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The identification strategy uses matched controls.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Methods'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalled();
        });
        sourceIndexServiceMock.indexDocumentSourceSpans.mockClear();

        fireEvent.click(await screen.findByText('Retry mocked agent'));

        await waitFor(() => {
            expect(agentMock.retryReadingAgentTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'task-agent-doc-opened-md',
                    documentId: 'doc-opened-md',
                    type: 'paper_overview_agent',
                    status: 'failed',
                }),
                expect.objectContaining({
                    agentOptions: expect.objectContaining({
                        goal: expect.stringContaining('paper overview'),
                        tools: expect.any(Object),
                    }),
                })
            );
        });
        expect(sourceIndexServiceMock.indexDocumentSourceSpans).not.toHaveBeenCalled();
    });

    it('starts a paper overview agent task for the current document from the Tasks panel', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The identification strategy uses matched controls.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Methods'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalled();
        });

        fireEvent.click(await screen.findByText('Start mocked paper overview'));

        await waitFor(() => {
            expect(agentMock.runReadingAgentTask).toHaveBeenCalledWith(expect.objectContaining({
                task: expect.objectContaining({
                    documentId: 'doc-opened-md',
                    type: 'paper_overview_agent',
                    title: 'Paper overview',
                    payload: {
                        agentOptions: expect.objectContaining({
                            taskType: 'paper_overview_agent',
                            documentId: 'doc-opened-md',
                            skillPath: 'docs/reading-agent-skills/paper-overview.md',
                            requiredTools: [
                                'get_current_document',
                                'get_document_chunks',
                            ],
                        }),
                    },
                }),
                agentOptions: expect.objectContaining({
                    goal: expect.stringContaining('paper overview'),
                    tools: expect.any(Object),
                }),
            }));
        });
        expect(agentMock.createReadingTools).toHaveBeenCalledWith(
            expect.objectContaining({
                document: expect.objectContaining({
                    id: 'doc-opened-md',
                    contentText: expect.stringContaining('identification strategy'),
                }),
            }),
            expect.objectContaining({
                listAttentionInsightsForDocument: expect.any(Function),
            })
        );
    });

    it('starts an attention route agent task for the current document from the Tasks panel', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The result section reports matched-control evidence.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Results'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalled();
        });

        fireEvent.click(await screen.findByText('Start mocked attention route'));

        await waitFor(() => {
            expect(agentMock.runReadingAgentTask).toHaveBeenCalledWith(expect.objectContaining({
                task: expect.objectContaining({
                    documentId: 'doc-opened-md',
                    type: 'attention_agent',
                    title: 'Attention route',
                    payload: {
                        agentOptions: expect.objectContaining({
                            taskType: 'attention_agent',
                            documentId: 'doc-opened-md',
                            skillPath: 'docs/reading-agent-skills/attention-route.md',
                            requiredTools: [
                                'get_current_document',
                                'get_document_chunks',
                                'list_attention_insights',
                            ],
                        }),
                    },
                }),
                agentOptions: expect.objectContaining({
                    goal: expect.stringContaining('reading positions'),
                    tools: expect.any(Object),
                }),
            }));
        });
    });

    it('shows Create VibeCard as a runnable reading agent skill', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The paper has enough source material for VibeCards.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Notes'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalled();
        });

        await screen.findByTestId('mock-task-status-panel');

        expect(taskStatusPanelMock.lastProps.agentSkills).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'card_generation_agent',
                title: 'Create VibeCard',
            }),
        ]));
    });

    it('does not start Create VibeCard when the write confirmation is cancelled', async () => {
        Modal.confirm.mockImplementationOnce((options = {}) => {
            options.onCancel?.();
            return { destroy: vi.fn(), update: vi.fn() };
        });
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The paper has enough source material for VibeCards.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Notes'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalled();
        });

        fireEvent.click(await screen.findByText('Start mocked create vibecard'));

        expect(Modal.confirm).toHaveBeenCalledWith(expect.objectContaining({
            title: '生成阅读卡片',
            content: expect.stringContaining('至少 3 张'),
        }));
        expect(agentMock.runReadingAgentTask).not.toHaveBeenCalled();
    });

    it('starts Create VibeCard with write permission and a VibeCard adapter after confirmation', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The paper has enough source material for VibeCards.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Notes'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalled();
        });

        fireEvent.click(await screen.findByText('Start mocked create vibecard'));

        await waitFor(() => {
            expect(agentMock.runReadingAgentTask).toHaveBeenCalledWith(expect.objectContaining({
                task: expect.objectContaining({
                    documentId: 'doc-opened-md',
                    type: 'card_generation_agent',
                    title: 'Create VibeCard',
                    payload: {
                        agentOptions: expect.objectContaining({
                            taskType: 'card_generation_agent',
                            documentId: 'doc-opened-md',
                            skillPath: 'docs/reading-agent-skills/card-generation.md',
                            maxIterations: 6,
                            requiredTools: [
                                'get_current_document',
                                'get_document_chunks',
                                'create_vibecard',
                            ],
                            outputArtifactType: 'vibecard',
                        }),
                    },
                }),
                agentOptions: expect.objectContaining({
                    goal: expect.stringContaining('VibeCards'),
                    permissions: expect.objectContaining({
                        allowedTools: expect.arrayContaining(['create_vibecard']),
                        canWriteVibeCards: true,
                    }),
                    tools: expect.any(Object),
                }),
            }));
        });
        expect(agentMock.createReadingTools).toHaveBeenCalledWith(
            expect.objectContaining({
                document: expect.objectContaining({ id: 'doc-opened-md' }),
            }),
            expect.objectContaining({
                createVibeCard: expect.any(Function),
            })
        );
    });

    it('renders three saved VibeCards in Notes after a confirmed Create VibeCard run', async () => {
        const cards = [
            {
                type: 'concept',
                title: 'VibeCard 1: Research problem',
                sourceText: 'The source text for the research problem.',
                aiContent: 'Review this source-backed point: research problem.',
                page: 1,
                paragraphId: 'page-1-para-1',
                tags: ['agent-generated', 'vibecard'],
                source: {
                    page: 1,
                    paragraphId: 'page-1-para-1',
                    selectedText: 'The source text for the research problem.',
                    sourceType: 'agent-card-generation',
                },
                verificationStatus: 'grounded',
            },
            {
                type: 'concept',
                title: 'VibeCard 2: Method',
                sourceText: 'The source text for the method.',
                aiContent: 'Review this source-backed point: method.',
                page: 2,
                paragraphId: 'page-2-para-1',
                tags: ['agent-generated', 'vibecard'],
                source: {
                    page: 2,
                    paragraphId: 'page-2-para-1',
                    selectedText: 'The source text for the method.',
                    sourceType: 'agent-card-generation',
                },
                verificationStatus: 'grounded',
            },
            {
                type: 'concept',
                title: 'VibeCard 3: Evidence',
                sourceText: 'The source text for the evidence.',
                aiContent: 'Review this source-backed point: evidence.',
                page: 3,
                paragraphId: 'page-3-para-1',
                tags: ['agent-generated', 'vibecard'],
                source: {
                    page: 3,
                    paragraphId: 'page-3-para-1',
                    selectedText: 'The source text for the evidence.',
                    sourceType: 'agent-card-generation',
                },
                verificationStatus: 'grounded',
            },
        ];
        let artifactIndex = 0;
        artifactServiceMock.createArtifact.mockImplementation(async (artifact) => ({
            ...artifact,
            id: artifact.id || `agent-card-${artifactIndex += 1}`,
        }));
        agentMock.runReadingAgentTask.mockImplementationOnce(async ({ agentOptions }) => {
            for (const card of cards) {
                await agentOptions.tools.create_vibecard.run({ card });
            }
            return {
                status: 'succeeded',
                agentResult: {
                    status: 'completed',
                    content: '# Created VibeCards\n\nCreated 3 source-grounded VibeCards.',
                    sourceRefs: cards.map((card) => ({
                        documentId: 'doc-opened-md',
                        page: card.page,
                        paragraphId: card.paragraphId,
                        text: card.sourceText,
                    })),
                },
            };
        });
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The paper has enough source material for VibeCards.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Notes'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalled();
        });

        fireEvent.click(await screen.findByText('Start mocked create vibecard'));

        await screen.findByTestId('mock-artifact-panel');
        await waitFor(() => {
            expect(artifactPanelMock.lastProps.artifacts).toHaveLength(3);
        });
        expect(artifactServiceMock.createArtifact).toHaveBeenCalledTimes(3);
        expect(useUIStore.getState().rightToolTab).toBe('artifacts');
        expect(artifactPanelMock.lastProps.artifacts).toEqual(expect.arrayContaining([
            expect.objectContaining({
                documentId: 'doc-opened-md',
                goal: 'VibeCard 1: Research problem',
                currentContent: expect.objectContaining({
                    sourceText: 'The source text for the research problem.',
                    aiContent: 'Review this source-backed point: research problem.',
                }),
                verificationStatus: 'grounded',
            }),
            expect.objectContaining({
                goal: 'VibeCard 2: Method',
                currentContent: expect.objectContaining({
                    sourceText: 'The source text for the method.',
                }),
            }),
            expect.objectContaining({
                goal: 'VibeCard 3: Evidence',
                currentContent: expect.objectContaining({
                    sourceText: 'The source text for the evidence.',
                }),
            }),
        ]));
    });

    it('saves a completed agent task result as a reading note artifact', async () => {
        documentServiceMock.fileToDocument.mockReturnValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
        });
        documentServiceMock.fileToDocumentWithContent.mockResolvedValue({
            id: 'doc-opened-md',
            name: 'opened.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'The identification strategy uses matched controls.',
        });

        const { App } = await import('./App.jsx');
        render(<App />);

        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['# Methods'], 'opened.md', { type: 'text/markdown' })],
            },
        });

        await waitFor(() => {
            expect(sourceIndexServiceMock.indexDocumentSourceSpans).toHaveBeenCalled();
        });

        fireEvent.click(await screen.findByText('Save mocked task result'));

        await waitFor(() => {
            expect(artifactServiceMock.createArtifact).toHaveBeenCalledWith(expect.objectContaining({
                documentId: 'doc-opened-md',
                type: 'reading_note',
                goal: 'Paper overview',
                originalContent: expect.objectContaining({
                    title: 'Paper overview',
                    body: expect.stringContaining('Important source-backed finding.'),
                    taskId: 'task-agent-overview-doc-opened-md',
                    taskType: 'paper_overview_agent',
                    sourceRefs: [
                        {
                            documentId: 'doc-opened-md',
                            page: 2,
                            paragraphId: 'page-2-para-0',
                            text: 'Important source-backed finding.',
                        },
                    ],
                }),
                currentContent: expect.objectContaining({
                    body: expect.stringContaining('Important source-backed finding.'),
                    sourceRefs: [
                        {
                            documentId: 'doc-opened-md',
                            page: 2,
                            paragraphId: 'page-2-para-0',
                            text: 'Important source-backed finding.',
                        },
                    ],
                }),
                source: expect.objectContaining({
                    documentId: 'doc-opened-md',
                    taskId: 'task-agent-overview-doc-opened-md',
                    sourceType: 'agent-task',
                    page: 2,
                    paragraphId: 'page-2-para-0',
                }),
                sourceSpanIds: ['page-2-para-0'],
                verificationStatus: 'grounded',
            }));
        });
        expect(await screen.findByTestId('mock-artifact-panel')).toBeTruthy();
    });
});
