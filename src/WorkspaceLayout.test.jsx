import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationStore, useDocumentStore, usePdfStore, useUIStore, useVibeStore } from './store';

const mockListPersistentDocuments = vi.hoisted(() => vi.fn(async () => []));
const documentServiceMock = vi.hoisted(() => ({
    fileToDocument: vi.fn(),
    fileToDocumentWithContent: vi.fn(),
    openTauriDocument: vi.fn(),
}));
const sourceIndexServiceMock = vi.hoisted(() => ({
    buildIndexedRetrievalContext: vi.fn(async () => null),
    indexDocumentSourceSpans: vi.fn(async () => []),
}));
const artifactServiceMock = vi.hoisted(() => ({
    createArtifact: vi.fn(async (artifact) => artifact),
    listArtifactsForDocument: vi.fn(async () => []),
    updateArtifact: vi.fn(async (id, patch) => ({ id, ...patch })),
    deleteArtifact: vi.fn(async () => true),
}));
const agentMock = vi.hoisted(() => ({
    createReadingTools: vi.fn(() => ({
        get_current_document: { run: vi.fn() },
        get_document_chunks: { run: vi.fn() },
    })),
    generateLensCardArtifact: vi.fn(),
    retryReadingAgentTask: vi.fn(async () => ({ status: 'succeeded' })),
    runReadingAgentTask: vi.fn(async () => ({ status: 'succeeded' })),
}));
const taskStatusPanelMock = vi.hoisted(() => ({
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
    listPersistentDocuments: mockListPersistentDocuments,
    savePersistentDocument: vi.fn(async (document) => document),
}));

vi.mock('./services/sourceIndexService', () => sourceIndexServiceMock);

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
    ArtifactPanel: () => <div data-testid="mock-artifact-panel" />,
    default: () => <div data-testid="mock-artifact-panel" />,
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
                    onClick={() => props.onSaveTaskResult?.({
                        id: 'task-agent-overview-doc-opened-md',
                        documentId: 'doc-opened-md',
                        type: 'paper_overview_agent',
                        status: 'succeeded',
                        title: 'Paper overview',
                        result: {
                            content: '# Paper overview\n\nImportant source-backed finding.',
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
                    onClick={() => props.onSaveTaskResult?.({
                        id: 'task-agent-overview-doc-opened-md',
                        documentId: 'doc-opened-md',
                        type: 'paper_overview_agent',
                        status: 'succeeded',
                        title: 'Paper overview',
                        result: {
                            content: '# Paper overview\n\nImportant source-backed finding.',
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
        documentServiceMock.fileToDocument.mockReset();
        documentServiceMock.fileToDocumentWithContent.mockReset();
        documentServiceMock.openTauriDocument.mockReset();
        sourceIndexServiceMock.buildIndexedRetrievalContext.mockClear();
        sourceIndexServiceMock.indexDocumentSourceSpans.mockClear();
        artifactServiceMock.createArtifact.mockClear();
        artifactServiceMock.listArtifactsForDocument.mockClear();
        artifactServiceMock.updateArtifact.mockClear();
        artifactServiceMock.deleteArtifact.mockClear();
        agentMock.createReadingTools.mockClear();
        agentMock.generateLensCardArtifact.mockClear();
        agentMock.retryReadingAgentTask.mockClear();
        agentMock.runReadingAgentTask.mockClear();
        taskStatusPanelMock.lastProps = null;
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        resetStores();
        document.body.innerHTML = '<div id="root"></div>';
    });

    afterEach(() => {
        cleanup();
        resetStores();
        document.body.innerHTML = '';
    });

    it('embeds Skim Map as the left margin of the reading surface and keeps Lens Cards under Notes', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        await screen.findByText('Workspace');

        const readingSurface = document.querySelector('.workspace-reading-surface');
        const skimMap = document.querySelector('.workspace-skim-map-pane[aria-label="Skim Map"]');
        const reader = document.querySelector('.workspace-reader-pane');
        const notesTab = screen.getByText(/Notes|笔记/).closest('[role="tab"]');
        const tasksTab = screen.getByText('Tasks').closest('[role="tab"]');

        expect(readingSurface).toBeTruthy();
        expect(skimMap).toBeTruthy();
        expect(reader).toBeTruthy();
        expect(notesTab).toBeTruthy();
        expect(tasksTab).toBeTruthy();
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

        await screen.findByText('Recent documents');
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

        fireEvent.click(screen.getByText('Tasks'));
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

        fireEvent.click(screen.getByText('Tasks'));
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

        fireEvent.click(screen.getByText('Tasks'));
        fireEvent.click(await screen.findByText('Start mocked paper overview'));

        await waitFor(() => {
            expect(agentMock.runReadingAgentTask).toHaveBeenCalledWith(expect.objectContaining({
                task: expect.objectContaining({
                    documentId: 'doc-opened-md',
                    type: 'paper_overview_agent',
                    title: 'Paper overview',
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
            })
        );
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

        fireEvent.click(screen.getByText('Tasks'));
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
                }),
                currentContent: expect.objectContaining({
                    body: expect.stringContaining('Important source-backed finding.'),
                }),
                source: expect.objectContaining({
                    documentId: 'doc-opened-md',
                    taskId: 'task-agent-overview-doc-opened-md',
                    sourceType: 'agent-task',
                }),
                verificationStatus: 'ungrounded',
            }));
        });
        expect(await screen.findByTestId('mock-artifact-panel')).toBeTruthy();
    });
});
