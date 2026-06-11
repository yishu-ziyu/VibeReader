import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationStore, useDocumentStore, useModelStore, usePdfStore, useUIStore, useVibeStore } from './store';

const mockChatStream = vi.hoisted(() => vi.fn());
const mockSetPaperContext = vi.hoisted(() => vi.fn());
const attentionPanelMock = vi.hoisted(() => ({
    lastProps: null,
}));
const summaryPanelMock = vi.hoisted(() => ({
    lastProps: null,
}));
const artifactServiceMock = vi.hoisted(() => ({
    createArtifact: vi.fn(async (artifact) => ({
        id: 'artifact-answer-card',
        ...artifact,
    })),
    listArtifactsForDocument: vi.fn(async () => []),
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

vi.mock('./services/persistentStorage', () => ({
    initializePersistentStorage: vi.fn(async () => ({ initialized: false })),
    isPersistentStorageAvailable: vi.fn(() => false),
    listPersistentDocuments: vi.fn(async () => []),
    listPersistentSourceSpans: vi.fn(async () => []),
    loadPersistentSourceIndexStatus: vi.fn(async () => null),
    replacePersistentSourceSpans: vi.fn(async () => []),
    savePersistentSourceIndexStatus: vi.fn(async () => null),
    savePersistentDocument: vi.fn(async () => ({ ok: true })),
    searchPersistentSourceSpans: vi.fn(async () => []),
}));

vi.mock('./services/artifactService', () => artifactServiceMock);

vi.mock('./aiService', () => ({
    default: {
        addMessage: vi.fn(),
        chatStream: mockChatStream,
        clearHistory: vi.fn(),
        setConfig: vi.fn(),
        setPaperContext: mockSetPaperContext,
    },
}));

vi.mock('@ant-design/x', () => ({
    Bubble: ({ content }) => content,
}));

vi.mock('./ChatInput', () => ({
    default: ({ onSubmit }) => (
        <div>
            <button type="button" onClick={() => onSubmit('What is the identification strategy?', [])}>
                Ask mocked retrieval question
            </button>
            <button type="button" onClick={() => onSubmit('Explain this page.', [])}>
                Ask mocked current page question
            </button>
        </div>
    ),
}));

vi.mock('./PdfViewer', () => ({
    PdfViewer: ({ onPageChange }) => {
        React.useEffect(() => {
            const timer = window.setTimeout(() => onPageChange?.(3), 0);
            return () => window.clearTimeout(timer);
        }, [onPageChange]);
        return <div data-testid="mock-pdf-viewer">PDF Viewer</div>;
    },
}));

vi.mock('./ThinkingTreePanel', () => ({
    ThinkingTreePanel: () => <div>Skim Map</div>,
    default: () => <div>Skim Map</div>,
}));

function MockSummaryPanel(props) {
    summaryPanelMock.lastProps = props;
    return (
        <div>
            <div>Summary</div>
            <button
                type="button"
                onClick={() => props.onArtifactCreated?.({
                    id: 'artifact-summary-concept',
                    documentId: 'doc-retrieval',
                    type: 'concept_card',
                    goal: 'Concept Card：Methods',
                    currentContent: {
                        summary: 'Mocked summary card',
                    },
                })}
            >
                Save mocked summary concept card
            </button>
        </div>
    );
}

vi.mock('./SummaryPanel', () => ({
    SummaryPanel: MockSummaryPanel,
    default: MockSummaryPanel,
}));

vi.mock('./FlashcardDeck', () => ({
    FlashcardDeck: () => <div>Cards</div>,
    default: () => <div>Cards</div>,
}));

vi.mock('./AttentionNavigatorPanel', () => ({
    AttentionNavigatorPanel: (props) => {
        attentionPanelMock.lastProps = props;
        return (
            <div>
                <div>Attention</div>
                <button type="button" onClick={() => props.onAskAI?.('Explain this attention insight.')}>
                    Ask mocked attention insight
                </button>
            </div>
        );
    },
    default: (props) => {
        attentionPanelMock.lastProps = props;
        return (
            <div>
                <div>Attention</div>
                <button type="button" onClick={() => props.onAskAI?.('Explain this attention insight.')}>
                    Ask mocked attention insight
                </button>
            </div>
        );
    },
}));

function MockArtifactPanel({ artifacts = [], onNavigateToSource }) {
    return (
        <div>
            <div>Notes</div>
            {artifacts.map((artifact) => (
                <article key={artifact.id}>
                    <h2>{artifact.goal}</h2>
                    <p>{artifact.currentContent?.summary}</p>
                    <p>{artifact.currentContent?.answer}</p>
                    <button type="button" onClick={() => onNavigateToSource?.(artifact)}>
                        回到原文
                    </button>
                </article>
            ))}
        </div>
    );
}

vi.mock('./ArtifactPanel', () => ({
    ArtifactPanel: MockArtifactPanel,
    default: MockArtifactPanel,
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
    useModelStore.setState({
        selectedModel: {
            key: 'custom',
            label: 'Test Model',
            config: {
                id: 'test-model',
                baseUrl: 'https://example.test/v1',
                apiKey: 'test-key',
                modelName: 'test-model',
                apiFormat: 'openai',
            },
        },
        visionCapable: false,
    });
    useVibeStore.getState().clearVibeData();
}

describe('App retrieval context', () => {
    beforeEach(() => {
        localStorage.clear();
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        mockChatStream.mockImplementation(async (_prompt, onUpdate) => {
            onUpdate({
                done: true,
                fullMessage: 'The answer cites the document source.',
            });
        });
        attentionPanelMock.lastProps = null;
        summaryPanelMock.lastProps = null;
        artifactServiceMock.createArtifact.mockClear();
        artifactServiceMock.listArtifactsForDocument.mockClear();
        resetStores();
        act(() => {
            useDocumentStore.getState().addDocument({
                id: 'doc-retrieval',
                name: 'working-paper.pdf',
                kind: 'pdf',
                pdfPages: 3,
                contentText: [
                    '--- 第 1 页 ---',
                    'The abstract introduces a placebo exercise and broad motivation.',
                    '',
                    '--- 第 2 页 ---',
                    'The identification strategy uses a difference in differences design with treated firms and matched controls.',
                    '',
                    '--- 第 3 页 ---',
                    'The conclusion discusses policy implications for market design.',
                ].join('\n'),
                pdfText: [
                    '--- 第 1 页 ---',
                    'The abstract introduces a placebo exercise and broad motivation.',
                    '',
                    '--- 第 2 页 ---',
                    'The identification strategy uses a difference in differences design with treated firms and matched controls.',
                    '',
                    '--- 第 3 页 ---',
                    'The conclusion discusses policy implications for market design.',
                ].join('\n'),
                vibeData: {
                    title: 'Working Paper',
                    sections: [
                        { id: 'sec-abstract', title: 'Abstract', pageStart: 1, pageEnd: 1 },
                        { id: 'sec-methods', title: 'Methods', pageStart: 2, pageEnd: 2 },
                        { id: 'sec-conclusion', title: 'Conclusion', pageStart: 3, pageEnd: 3 },
                    ],
                },
            });
        });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        resetStores();
        document.body.innerHTML = '';
    });

    it('sends retrieved source excerpts to chat and stores assistant source refs', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });

        const messageContent = mockChatStream.mock.calls[0][0];
        expect(messageContent).toContain('What is the identification strategy?');
        expect(messageContent).toContain('Relevant source excerpts');
        expect(messageContent).toContain('[source:doc-retrieval:p2:page-2-para-0]');
        expect(messageContent).toContain('difference in differences');
        expect(messageContent).not.toContain('placebo exercise');
        expect(messageContent).not.toContain('policy implications');
        expect(mockSetPaperContext).not.toHaveBeenCalledWith(expect.stringContaining('placebo exercise'));

        await waitFor(() => {
            const assistantMessage = useConversationStore.getState().messages.find((message) => message.role === 'assistant');
            expect(assistantMessage).toEqual(expect.objectContaining({
                content: 'The answer cites the document source.',
                sourceRefs: [
                    expect.objectContaining({
                        documentId: 'doc-retrieval',
                        page: 2,
                        paragraphId: 'page-2-para-0',
                    }),
                ],
            }));
        });
        expect(await screen.findByText('Sources')).toBeTruthy();
        expect(screen.getByRole('button', { name: /P2/ })).toBeTruthy();
    });

    it('dispatches a paragraph navigation event with source text when a source ref is clicked', async () => {
        const navigateListener = vi.fn();
        window.addEventListener('vibereader:navigate-paragraph', navigateListener);
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        const sourceButton = await screen.findByRole('button', {
            name: /Open source P2: The identification strategy/i,
        });
        fireEvent.click(sourceButton);

        expect(navigateListener).toHaveBeenCalledTimes(1);
        expect(navigateListener.mock.calls[0][0].detail).toEqual(expect.objectContaining({
            documentId: 'doc-retrieval',
            page: 2,
            paragraphId: 'page-2-para-0',
            text: expect.stringContaining('difference in differences'),
        }));

        window.removeEventListener('vibereader:navigate-paragraph', navigateListener);
    });

    it('uses the current PDF page when current-page chat context is selected', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        await screen.findByText(/P3/);
        fireEvent.click(await screen.findByRole('radio', { name: 'Current page' }));
        fireEvent.click(await screen.findByText('Ask mocked current page question'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });

        const messageContent = mockChatStream.mock.calls[0][0];
        expect(messageContent).toContain('Current page source excerpts');
        expect(messageContent).toContain('[source:doc-retrieval:p3:page-3-para-0]');
        expect(messageContent).toContain('policy implications');
        expect(messageContent).not.toContain('difference in differences');
        expect(messageContent).not.toContain('placebo exercise');
    });

    it('uses the current section when current-section chat context is selected', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        await screen.findByText(/P3.*Conclusion/);
        fireEvent.click(await screen.findByRole('radio', { name: 'Current section' }));
        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });

        const messageContent = mockChatStream.mock.calls[0][0];
        expect(messageContent).toContain('Current section source excerpts');
        expect(messageContent).toContain('[source:doc-retrieval:p3:page-3-para-0]');
        expect(messageContent).toContain('policy implications');
        expect(messageContent).not.toContain('difference in differences');
        expect(messageContent).not.toContain('placebo exercise');
    });

    it('uses the selected paragraph when selected-paragraph chat context is selected', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        act(() => {
            window.dispatchEvent(new CustomEvent('vibereader:select-paragraph', {
                detail: { paragraphId: 'page-1-para-0' },
            }));
        });
        fireEvent.click(await screen.findByRole('radio', { name: 'Selected paragraph' }));
        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });

        const messageContent = mockChatStream.mock.calls[0][0];
        expect(messageContent).toContain('Selected paragraph source excerpts');
        expect(messageContent).toContain('[source:doc-retrieval:p1:page-1-para-0]');
        expect(messageContent).toContain('placebo exercise');
        expect(messageContent).not.toContain('difference in differences');
        expect(messageContent).not.toContain('policy implications');
    });

    it('lets the attention navigator send a focused insight question to chat', async () => {
        useUIStore.setState({ rightToolTab: 'navigator' });
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked attention insight'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });
        expect(attentionPanelMock.lastProps?.onAskAI).toEqual(expect.any(Function));
        expect(mockChatStream.mock.calls[0][0]).toContain('Explain this attention insight.');
    });

    it('receives Summary Concept Cards and switches the right pane to Notes', async () => {
        useUIStore.setState({ rightToolTab: 'summary' });
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Save mocked summary concept card'));

        await waitFor(() => {
            expect(useUIStore.getState().rightToolTab).toBe('artifacts');
            expect(screen.getByText('Mocked summary card')).toBeTruthy();
        });
        expect(summaryPanelMock.lastProps?.onArtifactCreated).toEqual(expect.any(Function));
    });

    it('saves an assistant answer as a source-bound explain card', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        const saveButton = await screen.findByRole('button', {
            name: /保存回答卡片/,
        });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(artifactServiceMock.createArtifact).toHaveBeenCalledWith(expect.objectContaining({
                documentId: 'doc-retrieval',
                type: 'explain_card',
                goal: 'AI 回答：What is the identification strategy?',
                originalContent: expect.objectContaining({
                    question: 'What is the identification strategy?',
                    answer: 'The answer cites the document source.',
                    sourceRefs: [
                        expect.objectContaining({
                            documentId: 'doc-retrieval',
                            page: 2,
                            paragraphId: 'page-2-para-0',
                        }),
                    ],
                }),
                verificationStatus: 'grounded',
            }));
        });
        await waitFor(() => {
            expect(screen.getAllByText('Notes').length).toBeGreaterThan(0);
        });
    });

    it('navigates a saved source-ref card back to its paragraph source from Notes', async () => {
        const navigateListener = vi.fn();
        window.addEventListener('vibereader:navigate-paragraph', navigateListener);
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));
        fireEvent.click(await screen.findByRole('button', {
            name: /保存回答卡片/,
        }));

        await screen.findByText('The answer cites the document source.');
        fireEvent.click(screen.getByRole('button', { name: '回到原文' }));

        expect(navigateListener).toHaveBeenCalledTimes(1);
        expect(navigateListener.mock.calls[0][0].detail).toEqual(expect.objectContaining({
            documentId: 'doc-retrieval',
            page: 2,
            paragraphId: 'page-2-para-0',
            text: expect.stringContaining('difference in differences'),
        }));

        window.removeEventListener('vibereader:navigate-paragraph', navigateListener);
    });
});
