import React, { useRef, useEffect, useCallback, useState, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Bubble } from '@ant-design/x';
import { Button, Flex, message as antMessage, Spin, Modal, Segmented, Slider, Tabs } from 'antd';
import { FontSizeOutlined, DeleteOutlined, PlusOutlined, FilePdfOutlined, FolderOpenOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CommentOutlined, FileTextOutlined, BookOutlined, ThunderboltOutlined, CompassOutlined, SettingOutlined, ClockCircleOutlined } from '@ant-design/icons';
import ChatInput from './ChatInput';
import aiService from './aiService';
import { MULTIMODAL_UNSUPPORTED_CODE } from './multimodalApiError';
import { buildChatHardFailureBubbleContent } from './chatHardFailureContent';
import { buildUserFriendlyErrorContent, classifyAiError } from './aiError';
import { validateRunnableModelConfig } from './modelConfigGuard';
import { t, formatCustomModelLabel } from './i18n';
import MarkdownRenderer from './MarkdownRenderer';
import { extractTextFromPDF } from './pdfService';
import { fileToDocument, fileToDocumentWithContent, openTauriDocument, SUPPORTED_DOCUMENT_EXTENSIONS } from './services/documentService';
import { createArtifact, deleteArtifact, listArtifactsForDocument, updateArtifact } from './services/artifactService';
import { initializePersistentStorage, listPersistentDocuments, savePersistentDocument } from './services/persistentStorage';
import { isVisionCapableByModelName } from './modelPresets';
import { createReadingTools, generateLensCardArtifact, retryReadingAgentTask, runReadingAgentTask } from './agent';
import { buildIndexedRetrievalContext, indexDocumentSourceSpans } from './services/sourceIndexService';
import {
    saveConversation, loadConversation, listConversations, deleteConversation,
    getFontScale, setFontScale, getModelConfigs, getSelectedConfigId
} from './storage';
import { useConversationStore, useDocumentStore, useModelStore, usePdfStore, useUIStore } from './store';
import { useVibeStore } from './store';
import { PdfViewer } from './PdfViewer';
import { DocumentReader } from './DocumentReader';
import {
    createDragInjectDraftId,
    DRAG_INJECT_EFFECT,
    formatDragInjectQuote,
    hasDragInjectData,
    readDragInjectData,
} from './dragInject';
import './styles.css';
import viberoIconPng from '../icons/vibero.png';

// Lazy-load AI panel components to reduce initial bundle size
const SummaryPanel = React.lazy(() => import('./SummaryPanel').then(m => ({ default: m.SummaryPanel })));
const FlashcardDeck = React.lazy(() => import('./FlashcardDeck').then(m => ({ default: m.FlashcardDeck })));
const ThinkingTreePanel = React.lazy(() => import('./ThinkingTreePanel').then(m => ({ default: m.ThinkingTreePanel })));
const AttentionNavigatorPanel = React.lazy(() => import('./AttentionNavigatorPanel').then(m => ({ default: m.AttentionNavigatorPanel })));
const ArtifactPanel = React.lazy(() => import('./ArtifactPanel').then(m => ({ default: m.ArtifactPanel })));
const TaskStatusPanel = React.lazy(() => import('./TaskStatusPanel').then(m => ({ default: m.TaskStatusPanel })));

/** Simple fallback for lazy-loaded panels */
function PanelFallback() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin size="small" />
        </div>
    );
}

/** 附图仅 data URL */
function chatImageDataUrl(img) {
    return img && typeof img.base64 === 'string' && img.base64 ? img.base64 : '';
}

function isExplicitDocumentContext(text = '') {
    return /^\s*(Based on the following|基于以下)/i.test(String(text));
}

function messageTextWithRetrievalContext(text, retrievalContext) {
    if (!retrievalContext?.prompt) return text;
    return `${String(text || '').trim()}\n\n${retrievalContext.prompt}`;
}

function sourceRefSnippet(sourceRef = {}, maxLength = 96) {
    const normalized = String(sourceRef.text || sourceRef.sourceText || sourceRef.selectedText || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function messagePlainText(content = '') {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter((part) => part?.type === 'text' && typeof part.text === 'string')
            .map((part) => part.text)
            .join('\n');
    }
    return '';
}

function answerCardTitle(question = '') {
    const normalized = String(question || '').replace(/\s+/g, ' ').trim() || '未绑定问题';
    return `AI 回答：${normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized}`;
}

function findSectionForPage(sections = [], page = 1) {
    if (!Array.isArray(sections) || sections.length === 0) return null;
    const pageNumber = Number(page) || 1;
    return sections.find((section, index) => {
        const nextSection = sections[index + 1];
        const pageStart = Number(section.pageStart) || 1;
        const inferredEnd = nextSection?.pageStart ? Number(nextSection.pageStart) - 1 : Infinity;
        const pageEnd = Number(section.pageEnd) || inferredEnd;
        return pageNumber >= pageStart && pageNumber <= pageEnd;
    }) || null;
}

function lastToolResult(trace = [], toolName) {
    return [...trace].reverse().find((entry) => (
        entry?.type === 'tool' && entry.toolName === toolName
    ))?.result || null;
}

function overviewSnippet(text = '', maxLength = 180) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function createLocalPaperOverviewModel() {
    return async ({ iteration, trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_current_document',
                args: {},
            };
        }

        if (iteration === 2) {
            return {
                type: 'tool_call',
                toolName: 'get_document_chunks',
                args: {
                    query: 'abstract introduction method results conclusion',
                    limit: 4,
                    maxChars: 900,
                },
            };
        }

        const metadata = lastToolResult(trace, 'get_current_document') || {};
        const chunkResult = lastToolResult(trace, 'get_document_chunks') || {};
        const chunks = Array.isArray(chunkResult.chunks) ? chunkResult.chunks : [];
        const sourceLines = chunks
            .map((chunk, index) => {
                const location = chunk.page ? `p.${chunk.page}` : chunk.paragraphId || `chunk-${index + 1}`;
                const snippet = overviewSnippet(chunk.text);
                return snippet ? `- ${location}: ${snippet}` : null;
            })
            .filter(Boolean);

        return {
            type: 'final',
            content: [
                '# Paper overview',
                '',
                `Document: ${metadata.name || 'Untitled'}`,
                `Type: ${metadata.kind || 'unknown'}`,
                metadata.pageCount ? `Pages: ${metadata.pageCount}` : '',
                '',
                'Initial source scan:',
                sourceLines.length > 0 ? sourceLines.join('\n') : '- No bounded source chunks were available.',
            ].filter(Boolean).join('\n'),
        };
    };
}

function createPaperOverviewAgentOptions(document) {
    return {
        goal: 'Create a concise paper overview for the current document using safe metadata and bounded source chunks.',
        model: createLocalPaperOverviewModel(),
        tools: createReadingTools({ document }),
        maxIterations: 4,
        timeoutMs: 30000,
    };
}

function createPaperOverviewRetryPlan(document, goal) {
    return {
        taskType: 'paper_overview_agent',
        documentId: document.id,
        goal,
        maxIterations: 4,
    };
}

function taskResultContent(task = {}) {
    const result = task.result && typeof task.result === 'object' ? task.result : {};
    return String(result.content || result.summary || result.text || '').trim();
}

function taskResultTitle(task = {}) {
    return task.title || task.type || 'Reading task result';
}

/** 系统提示 */
const SYSTEM_PROMPT = `你是 AI 助手，专门帮助用户阅读和理解学术论文。请用简洁、专业的语言回答问题。

格式要求：
1. 使用 Markdown 格式输出。
2. 数学公式必须用分隔符包裹才能渲染；禁止在正文里裸写 LaTeX。
   - 行内：用单个美元符包裹，如 $\\mathbf{p}_i$、$w_k$。
   - 块级：独占一行时用双美元符包裹整段。
   - 也可使用 \\(...\\) 作行内、\\[...\\] 作块级。
3. LaTeX 须语法正确：花括号与命令须配对。
4. 多行复杂公式可使用 ${'```'}math 围栏代码块。
5. 普通代码使用 ${'```'}语言名 围栏。

网页内容：
用户可以通过「网页工具」按钮粘贴 URL，系统会自动获取网页正文并插入到对话中。如果用户消息包含网页内容（带有 Source: URL 标识），请基于该内容回答问题，并引用来源。`;

/** 生成会话 ID */
function generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// VibeReader Logo
const vibeReaderLogo = (
    <img src={viberoIconPng} width="40" height="40" alt="Logo" />
);

// 定义 roles 配置
const roles = {
    assistant: {
        placement: 'start',
        variant: 'shadow',
        loadingRender: () => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20, color: '#262626' }}>...</span>
                <span style={{ fontSize: 14, color: '#666' }}>Thinking...</span>
            </div>
        ),
    },
    user: {
        placement: 'end',
        variant: 'shadow',
    },
};

function AssistantSourceRefs({ sourceRefs = [], onNavigate }) {
    if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) return null;

    return (
        <div className="assistant-source-refs">
            <span className="assistant-source-refs-label">Sources</span>
            {sourceRefs.map((sourceRef, index) => {
                const label = sourceRef.label || `P${sourceRef.page || 1}`;
                const snippet = sourceRefSnippet(sourceRef);
                const title = snippet ? `${label}: ${snippet}` : label;
                return (
                    <button
                        key={sourceRef.id || sourceRef.chunkId || `${sourceRef.documentId}-${sourceRef.page}-${index}`}
                        type="button"
                        className="assistant-source-ref-button"
                        aria-label={snippet ? `Open source ${label}: ${snippet}` : `Open source ${label}`}
                        title={title}
                        onClick={() => onNavigate?.(sourceRef)}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

export function App() {
    // Zustand stores
    const { messages, loading, sessions, currentSessionId, historyLoaded, setMessages, setLoading, setSessions, setCurrentSessionId, setHistoryLoaded } = useConversationStore();
    const { selectedModel, visionCapable, selectModel } = useModelStore();
    const { pdfText, pdfPages, pdfParsing, clearPdf, startParsing, finishParsing, failParsing, setPdfFile } = usePdfStore();
    const {
        fontScale,
        showFontSlider,
        sidebarCollapsed,
        rightToolTab,
        workspaceSplitRatio,
        setFontScale: setFontScaleState,
        setShowFontSlider,
        setSidebarCollapsed,
        setActiveToolTab,
        setRightToolTab,
        setWorkspaceSplitRatio,
    } = useUIStore();
    const { documents, addDocument, setActiveDocument, setDocuments, currentDocument } = useDocumentStore();
    const { vibeData } = useVibeStore();

    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const currentSessionIdRef = useRef(currentSessionId);
    const abortControllerRef = useRef(null);
    const [dragInjectActive, setDragInjectActive] = useState(false);
    const [pendingDragInjection, setPendingDragInjection] = useState(null);
    const [selectedParagraphId, setSelectedParagraphId] = useState(null);
    const [activeReaderPage, setActiveReaderPage] = useState(1);
    const [chatContextMode, setChatContextMode] = useState('relevant');
    const [insights, setInsights] = useState([]);
    const [artifacts, setArtifacts] = useState([]);
    const [modelConfigOpenSignal, setModelConfigOpenSignal] = useState(0);
    const activeSection = findSectionForPage(vibeData?.sections || currentDocument?.vibeData?.sections, activeReaderPage);

    useEffect(() => {
        let cancelled = false;

        initializePersistentStorage()
            .then(async () => {
                const persistentDocuments = await listPersistentDocuments();
                if (cancelled) return;
                setDocuments(persistentDocuments.map((document) => ({
                    ...document,
                    isRecentOnly: true,
                })));
            })
            .catch((error) => {
                console.warn('[App] Persistent storage initialization skipped:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [setDocuments]);

    useEffect(() => {
        currentSessionIdRef.current = currentSessionId;
    }, [currentSessionId]);

    useEffect(() => {
        if (rightToolTab === 'mindmap') {
            setRightToolTab('artifacts');
        }
    }, [rightToolTab, setRightToolTab]);

    useEffect(() => {
        let cancelled = false;
        if (!currentDocument?.id) {
            setArtifacts([]);
            return;
        }

        listArtifactsForDocument(currentDocument.id).then((items) => {
            if (!cancelled) setArtifacts(items);
        });

        return () => {
            cancelled = true;
        };
    }, [currentDocument?.id]);

    // 初始化：加载会话列表
    useEffect(() => {
        const init = async () => {
            const list = await listConversations();
            setSessions(list);
            if (list.length > 0) {
                const first = list[0];
                setCurrentSessionId(first.sessionId);
                const msgs = await loadConversation(first.sessionId);
                if (msgs) setMessages(msgs);
            } else {
                const newId = generateSessionId();
                setCurrentSessionId(newId);
                setMessages([]);
            }
            setHistoryLoaded(true);
        };
        init();
    }, []);

    // 自动滚动到底部
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // 获取当前 AI 服务实例（必须放在使用它的 useEffect 之前，避免 TDZ 错误）
    const getCurrentService = useCallback((validatedConfig = null) => {
        const config = validatedConfig || selectedModel.config;
        if (!config) return null;
        const apiType = config.apiType || (config.apiFormat === 'anthropic' ? 'anthropic-compatible' : 'openai-compatible');
        aiService.setConfig({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: config.model || config.modelName,
            apiType,
            authType: config.authType,
        });
        return aiService;
    }, [selectedModel]);

    // Synchronize reader stores with the active document to enforce multi-document isolation
    useEffect(() => {
        setInsights([]);
        setSelectedParagraphId(null);
        setActiveReaderPage(1);
        if (!currentDocument) {
            clearPdf();
            useVibeStore.getState().clearVibeData();
            const service = getCurrentService();
            if (service) {
                service.clearHistory();
                service.setPaperContext('');
            }
            return;
        }

        // Clear active window selections
        window.getSelection()?.removeAllRanges();

        // Restore PDF file/text/pages states
        if (currentDocument.kind === 'pdf') {
            const file = currentDocument.pdfFile || null;
            const text = currentDocument.pdfText || '';
            const pages = currentDocument.pdfPages || 0;
            const vibeData = currentDocument.vibeData || null;

            setPdfFile(file);
            finishParsing(text, pages);

            if (vibeData) {
                useVibeStore.setState({
                    vibeData,
                    parsing: false,
                    selectedSectionId: vibeData.sections[0]?.id || null,
                    parseError: null
                });
            } else if (text) {
                useVibeStore.getState().parsePdfText(text);
            } else {
                useVibeStore.getState().clearVibeData();
            }

            const service = getCurrentService();
            if (service) {
                service.clearHistory();
                service.setPaperContext('');
            }
        } else {
            // Markdown, Text, HTML
            const text = currentDocument.contentText || '';
            const vibeData = currentDocument.vibeData || null;

            setPdfFile(null);
            finishParsing(text, 1);

            if (vibeData) {
                useVibeStore.setState({
                    vibeData,
                    parsing: false,
                    selectedSectionId: vibeData.sections[0]?.id || null,
                    parseError: null
                });
            } else {
                useVibeStore.getState().parsePdfText(text);
            }

            const service = getCurrentService();
            if (service) {
                service.clearHistory();
                service.setPaperContext('');
            }
        }
    }, [currentDocument, setPdfFile, finishParsing, clearPdf, getCurrentService]);

    // 保存消息到 IndexedDB
    const persistMessages = useCallback(async (msgs) => {
        const sid = currentSessionIdRef.current;
        if (!sid) return;
        await saveConversation(sid, msgs);
        const list = await listConversations();
        setSessions(list);
    }, [setSessions]);

    // 字体大小调整
    const handleFontScaleChange = (value) => {
        setFontScaleState(value);
        setFontScale(value);
    };

    // 模型切换
    const handleModelChange = (model) => {
        selectModel(model);
    };

    const recordDocumentOpened = useCallback((document) => {
        savePersistentDocument(document).catch((error) => {
            console.warn('[App] Failed to persist opened document:', error);
        });
        indexDocumentSourceSpans(document).catch((error) => {
            console.warn('[App] Failed to index opened document:', error);
        });
    }, []);

    const handleStartAgentTask = useCallback((taskType) => {
        if (!currentDocument?.id) return;
        if (taskType !== 'paper_overview_agent') return;

        const agentOptions = createPaperOverviewAgentOptions(currentDocument);
        runReadingAgentTask({
            task: {
                documentId: currentDocument.id,
                type: 'paper_overview_agent',
                title: 'Paper overview',
                payload: {
                    agentOptions: createPaperOverviewRetryPlan(currentDocument, agentOptions.goal),
                },
            },
            agentOptions,
        }).catch((error) => {
            console.warn('[App] Failed to start paper overview agent:', error);
        });
    }, [currentDocument]);

    const handleRetryTask = useCallback((task) => {
        if (!currentDocument?.id || task?.documentId !== currentDocument.id) return;
        if (task.type === 'source_index') {
            indexDocumentSourceSpans(currentDocument).catch((error) => {
                console.warn('[App] Failed to retry source indexing:', error);
            });
            return;
        }

        if (task.type === 'paper_overview_agent') {
            retryReadingAgentTask(task, {
                agentOptions: createPaperOverviewAgentOptions(currentDocument),
            }).catch((error) => {
                console.warn('[App] Failed to retry paper overview agent:', error);
            });
            return;
        }

        if (String(task.type || '').endsWith('_agent')) {
            retryReadingAgentTask(task).catch((error) => {
                console.warn('[App] Failed to retry agent task:', error);
            });
        }
    }, [currentDocument]);

    // PDF 上传处理
    const handlePdfUpload = useCallback(async (file, preparedDocument = null) => {
        const document = preparedDocument || fileToDocument(file);
        if (!document || document.kind !== 'pdf') {
            antMessage.error(t('ai-chat-pdf-only', null, '请打开 PDF 文件。'));
            return;
        }

        startParsing();
        try {
            const { text, pages } = await extractTextFromPDF(file);
            
            // Get the viewer bytes set by extractTextFromPDF
            const pdfFileBytes = usePdfStore.getState().pdfFile;

            // Generate VIBE data
            useVibeStore.getState().parsePdfText(text);
            const vibeData = useVibeStore.getState().vibeData;

            const docWithContent = {
                ...document,
                pdfText: text,
                pdfPages: pages,
                contentText: text,
                pdfFile: pdfFileBytes,
                vibeData,
            };

            addDocument(docWithContent);
            recordDocumentOpened(docWithContent);
            finishParsing(text, pages);
            setActiveToolTab('pdf');
            setRightToolTab('artifacts');
            antMessage.success(t('ai-chat-pdf-parsed', { pages }));
        } catch (error) {
            console.error('[App] PDF parsing failed:', error);
            antMessage.error(t('ai-chat-pdf-parse-failed'));
            failParsing();
        }
    }, [addDocument, finishParsing, recordDocumentOpened, setActiveToolTab, setRightToolTab, startParsing, failParsing]);

    const handleReadableDocument = useCallback((document) => {
        if (!document || !['markdown', 'text', 'html'].includes(document.kind)) {
            antMessage.error(t('ai-chat-document-open-invalid', null, '请选择支持的文件。'));
            return;
        }

        useVibeStore.getState().parsePdfText(document.contentText || '');
        const vibeData = useVibeStore.getState().vibeData;

        const docWithContent = {
            ...document,
            pdfFile: null,
            pdfText: document.contentText || '',
            pdfPages: 1,
            vibeData,
        };

        addDocument(docWithContent);
        recordDocumentOpened(docWithContent);
        setPdfFile(null);
        finishParsing(document.contentText || '', 1);
        setActiveToolTab('pdf');
        setRightToolTab('artifacts');
        antMessage.success(t('ai-chat-document-opened', { name: document.name }, '文档已打开'));
    }, [addDocument, finishParsing, recordDocumentOpened, setActiveToolTab, setPdfFile, setRightToolTab]);

    const handleDocumentFile = useCallback(async (file) => {
        if (!file) return;
        const document = fileToDocument(file);
        if (document?.kind === 'pdf') {
            await handlePdfUpload(file, document);
            return;
        }
        const textDocument = await fileToDocumentWithContent(file);
        handleReadableDocument(textDocument);
    }, [handlePdfUpload, handleReadableDocument]);

    const handleDocumentDrop = useCallback((e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleDocumentFile(file);
    }, [handleDocumentFile]);

    const handleOpenDocument = useCallback(async () => {
        try {
            const result = await openTauriDocument();

            if (result.status === 'unsupported') {
                fileInputRef.current?.click();
                return;
            }

            if (result.status === 'cancelled') {
                return;
            }

            if (result.status === 'invalid') {
                antMessage.warning(result.message || t('ai-chat-document-open-invalid', null, '请选择支持的文件。'));
                return;
            }

            const { document } = result;
            if (!document) return;

            if (document.kind === 'pdf') {
                await handlePdfUpload(document.file, document);
                return;
            }

            handleReadableDocument(document);
        } catch (error) {
            console.error('[App] Failed to open document:', error);
            antMessage.error(t('ai-chat-document-open-failed', null, '打开文件失败，请重试或使用拖拽上传。'));
        }
    }, [handlePdfUpload, handleReadableDocument]);

    // 发送消息
    const handleSubmit = useCallback(async (text, images) => {
        if ((!text || !text.trim()) && (!images || images.length === 0)) return;

        const validation = validateRunnableModelConfig(selectedModel?.config);
        if (!validation.ok) {
            antMessage.error(validation.message);
            return;
        }

        const service = getCurrentService(validation.config);
        if (!service) {
            antMessage.error(t('vibe-ai-chat-prompt-configure-custom-first'));
            return;
        }

        const sendImages = (images || []).filter((img) => chatImageDataUrl(img));
        const retrievalContext = currentDocument && sendImages.length === 0 && !isExplicitDocumentContext(text)
            ? await buildIndexedRetrievalContext({
                document: currentDocument,
                query: text,
                mode: chatContextMode,
                page: activeReaderPage,
                section: activeSection,
                paragraphId: selectedParagraphId,
            })
            : null;
        const outboundText = messageTextWithRetrievalContext(text, retrievalContext);
        const retrievalSourceRefs = retrievalContext?.sourceRefs || [];

        // 论文上下文已准备好，添加用户消息
        const userMessage = {
            id: Date.now(),
            role: 'user',
            content: text,
            images: images || [],
            typing: false,
            timestamp: Date.now()
        };

        // 构建消息内容：支持文本和图片的多模态格式
        let messageContent = outboundText;
        if (sendImages.length > 0) {
            messageContent = [{ type: 'text', text: outboundText }];
            sendImages.forEach((img) => {
                messageContent.push({
                    type: 'image_url',
                    image_url: { url: chatImageDataUrl(img) },
                });
            });
        }

        // 创建 AI 消息占位符
        const aiMessageId = Date.now() + 1;
        const aiMessage = {
            id: aiMessageId,
            role: 'assistant',
            content: '',
            sourceRefs: retrievalSourceRefs,
            typing: true,
            timestamp: Date.now()
        };

        setLoading(true);
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        setMessages(prev => [...prev, userMessage, aiMessage]);

        // 请求硬失败时统一处理
        const performChat = async () => {
            try {
                await service.chatStream(
                    messageContent,
                    ({ done, content, fullMessage, thinking, fullThinking, hasThinking, interrupted, aborted, error, errorCode, errorTitle, errorAction, aiError }) => {
                        if (!done && (content || thinking)) {
                            setMessages(prev => prev.map(msg =>
                                msg.id === aiMessageId
                                    ? { ...msg, content: fullMessage, thinking: fullThinking, hasThinking, typing: true }
                                    : msg
                            ));
                        } else if (done) {
                            let finalContent = fullMessage;
                            const isMmRejected = interrupted && errorCode === MULTIMODAL_UNSUPPORTED_CODE;
                            const streamFailedHard = interrupted && !!error && !aborted && !isMmRejected;

                            if (interrupted) {
                                if (isMmRejected) {
                                    finalContent = t('vibe-ai-chat-multimodal-not-supported', {
                                        model: selectedModel.label,
                                    });
                                } else if (streamFailedHard) {
                                    if (aiError) {
                                        finalContent = buildUserFriendlyErrorContent(aiError);
                                    } else {
                                        finalContent = buildChatHardFailureBubbleContent(String(error), {
                                            modelLabel: selectedModel.label,
                                            multimodalRejectedCode: errorCode,
                                        });
                                    }
                                }
                            }

                            const finalMsg = {
                                id: aiMessageId,
                                role: 'assistant',
                                content: finalContent,
                                thinking: fullThinking,
                                hasThinking,
                                sourceRefs: retrievalSourceRefs,
                                typing: false,
                                timestamp: Date.now()
                            };

                            setMessages(prev => {
                                const updated = prev.map(msg =>
                                    msg.id === aiMessageId ? finalMsg : msg
                                );
                                persistMessages(updated);
                                return updated;
                            });
                            setLoading(false);
                            if (abortControllerRef.current === abortController) {
                                abortControllerRef.current = null;
                            }
                        }
                    },
                    { systemPrompt: SYSTEM_PROMPT, signal: abortController.signal }
                );
            } catch (error) {
                console.error('[App] Chat error:', error);
                if (abortController.signal.aborted || error?.name === 'AbortError') {
                    setMessages(prev => {
                        const updated = prev.map(msg =>
                            msg.id === aiMessageId
                                ? { ...msg, sourceRefs: retrievalSourceRefs, typing: false, timestamp: Date.now() }
                                : msg
                        );
                        persistMessages(updated);
                        return updated;
                    });
                    setLoading(false);
                    if (abortControllerRef.current === abortController) {
                        abortControllerRef.current = null;
                    }
                    return;
                }
                // 兜底：将未预料的错误显示在气泡中，而不是删除消息
                const fallbackError = buildUserFriendlyErrorContent(
                    classifyAiError(null, error.message, error)
                );
                setMessages(prev => {
                    const updated = prev.map(msg =>
                        msg.id === aiMessageId
                            ? { ...msg, content: fallbackError, sourceRefs: retrievalSourceRefs, typing: false, timestamp: Date.now() }
                            : msg
                    );
                    persistMessages(updated);
                    return updated;
                });
                setLoading(false);
                if (abortControllerRef.current === abortController) {
                    abortControllerRef.current = null;
                }
            }
        };

        performChat();
    }, [activeReaderPage, activeSection, chatContextMode, currentDocument, getCurrentService, selectedModel, persistMessages, selectedParagraphId]);

    const handleStopGenerating = useCallback(() => {
        abortControllerRef.current?.abort();
    }, []);

    // 从 PDF 段落注入到聊天
    const handleInjectPdfText = useCallback((text) => {
        if (!text) return;
        const prefix = t('ai-chat-pdf-context-prefix', null, 'Based on the following paper content:\n');
        setRightToolTab('chat');
        handleSubmit(prefix + text, []);
    }, [handleSubmit, setRightToolTab]);

    const handleInjectDocumentText = useCallback((text) => {
        if (!text) return;
        const prefix = t('ai-chat-document-context-prefix', null, 'Based on the following document content:\n');
        setRightToolTab('chat');
        handleSubmit(prefix + text, []);
    }, [handleSubmit, setRightToolTab]);

    const handleGenerateLensCard = useCallback(async (selection) => {
        if (!selection?.text?.trim()) return;
        if (!currentDocument?.id || currentDocument.kind !== 'pdf') {
            antMessage.warning('请先打开 PDF 文档');
            return;
        }

        const validation = validateRunnableModelConfig(selectedModel?.config);
        if (!validation.ok) {
            antMessage.error(validation.message);
            return;
        }

        const service = getCurrentService(validation.config);
        if (!service) {
            antMessage.error(t('vibe-ai-chat-prompt-configure-custom-first'));
            return;
        }

        const hideLoading = antMessage.loading('正在生成阅读卡片...', 0);
        try {
            const generateText = async (prompt) => {
                let finalText = '';
                let finalError = '';
                await service.chatStream(
                    prompt,
                    ({ done, fullMessage, error }) => {
                        if (!done) return;
                        finalText = fullMessage || '';
                        finalError = error || '';
                    },
                    { includeHistory: false, systemPrompt: SYSTEM_PROMPT }
                );
                if (finalError) throw new Error(finalError);
                return finalText;
            };

            const artifact = await generateLensCardArtifact({
                selection: {
                    ...selection,
                    documentId: currentDocument.id,
                    sourceType: 'pdf-selection',
                },
                document: currentDocument,
                modelId: selectedModel?.label || validation.config.model,
                generateText,
            });
            const saved = await createArtifact(artifact);
            setArtifacts((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
            setRightToolTab('artifacts');
            antMessage.success('已生成阅读卡片');
        } catch (error) {
            console.error('[App] Failed to generate Lens Card:', error);
            antMessage.error(error?.message || '生成阅读卡片失败');
        } finally {
            hideLoading();
        }
    }, [currentDocument, getCurrentService, selectedModel, setRightToolTab]);

    const handleArtifactCreated = useCallback((artifact) => {
        if (!artifact?.id) return;
        setArtifacts((items) => [artifact, ...items.filter((item) => item.id !== artifact.id)]);
        setRightToolTab('artifacts');
    }, [setRightToolTab]);

    const handleArtifactUpdated = useCallback(async (artifact, patch) => {
        if (!artifact?.id) return;
        try {
            const updated = await updateArtifact(artifact.id, {
                ...patch,
                documentId: artifact.documentId || currentDocument?.id,
            });
            if (!updated) {
                antMessage.warning('没有找到要更新的卡片');
                return;
            }
            setArtifacts((items) => items.map((item) => (item.id === updated.id ? updated : item)));
            antMessage.success('卡片已更新');
        } catch (error) {
            console.error('[App] Failed to update artifact:', error);
            antMessage.error(error?.message || '更新卡片失败');
        }
    }, [currentDocument?.id]);

    const handleArtifactDeleted = useCallback(async (artifact) => {
        if (!artifact?.id) return;
        try {
            await deleteArtifact(artifact.id);
            setArtifacts((items) => items.filter((item) => item.id !== artifact.id));
            antMessage.success('卡片已删除');
        } catch (error) {
            console.error('[App] Failed to delete artifact:', error);
            antMessage.error(error?.message || '删除卡片失败');
        }
    }, []);

    const handleSaveTaskResult = useCallback(async (task) => {
        if (!currentDocument?.id || task?.documentId !== currentDocument.id) return;
        const body = taskResultContent(task);
        if (!body) {
            antMessage.warning('任务没有可保存的结果');
            return;
        }

        const title = taskResultTitle(task);
        const content = {
            title,
            body,
            taskId: task.id,
            taskType: task.type,
        };

        try {
            const saved = await createArtifact({
                documentId: currentDocument.id,
                type: 'reading_note',
                goal: title,
                sourceSpanIds: [],
                source: {
                    documentId: currentDocument.id,
                    taskId: task.id,
                    sourceType: 'agent-task',
                },
                originalContent: content,
                currentContent: content,
                verificationStatus: 'ungrounded',
            });
            setArtifacts((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
            setRightToolTab('artifacts');
            antMessage.success('已保存到 Notes');
        } catch (error) {
            console.error('[App] Failed to save task result:', error);
            antMessage.error(error?.message || '保存任务结果失败');
        }
    }, [currentDocument?.id, setRightToolTab]);

    const handleSaveAssistantAnswerCard = useCallback(async (assistantMessage) => {
        if (!assistantMessage?.content?.trim()) return;
        const documentId = currentDocument?.id || assistantMessage.sourceRefs?.[0]?.documentId;
        if (!documentId) {
            antMessage.warning('请先打开文档');
            return;
        }

        const assistantIndex = messages.findIndex((message) => message.id === assistantMessage.id);
        const previousUserMessage = assistantIndex >= 0
            ? messages.slice(0, assistantIndex).reverse().find((message) => message.role === 'user')
            : null;
        const question = messagePlainText(previousUserMessage?.content || '');
        const sourceRefs = Array.isArray(assistantMessage.sourceRefs) ? assistantMessage.sourceRefs : [];
        const firstSource = sourceRefs[0] || null;
        const content = {
            question,
            answer: assistantMessage.content,
            sourceRefs,
        };

        try {
            const saved = await createArtifact({
                documentId,
                type: 'explain_card',
                goal: answerCardTitle(question),
                sourceSpanIds: sourceRefs.map((sourceRef) => sourceRef.paragraphId).filter(Boolean),
                ...(firstSource ? { source: { ...firstSource, sourceType: 'assistant-answer' } } : {}),
                originalContent: content,
                currentContent: content,
                verificationStatus: sourceRefs.length > 0 ? 'grounded' : 'ungrounded',
            });
            setArtifacts((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
            setRightToolTab('artifacts');
            antMessage.success('已保存为阅读卡片');
        } catch (error) {
            console.error('[App] Failed to save assistant answer card:', error);
            antMessage.error(error?.message || '保存回答卡片失败');
        }
    }, [currentDocument?.id, messages, setRightToolTab]);

    const handleNavigateArtifactSource = useCallback((artifact) => {
        const content = artifact?.currentContent || artifact?.originalContent || {};
        const firstSourceRef = Array.isArray(content.sourceRefs) ? content.sourceRefs.find(Boolean) : null;
        const source = artifact?.source || content.source || artifact?.originalContent?.source || firstSourceRef;
        if (!source) {
            antMessage.warning('这张卡片没有可回跳的来源');
            return;
        }

        if (source.paragraphId) {
            window.dispatchEvent(new CustomEvent('vibereader:navigate-paragraph', {
                detail: {
                    paragraphId: source.paragraphId,
                    page: source.page,
                    documentId: source.documentId || artifact?.documentId,
                    text: source.text || source.sourceText || source.selectedText || content.selectionText || '',
                },
            }));
            return;
        }

        window.dispatchEvent(new CustomEvent('vibereader:navigate-source-span', {
            detail: source,
        }));
    }, []);

    const handleNavigateSourceRef = useCallback((sourceRef) => {
        if (!sourceRef) return;
        if (sourceRef.paragraphId) {
            window.dispatchEvent(new CustomEvent('vibereader:navigate-paragraph', {
                detail: {
                    paragraphId: sourceRef.paragraphId,
                    page: sourceRef.page,
                    documentId: sourceRef.documentId,
                    text: sourceRef.text || sourceRef.sourceText || sourceRef.selectedText || '',
                },
            }));
            return;
        }

        window.dispatchEvent(new CustomEvent('vibereader:navigate-source-span', {
            detail: sourceRef,
        }));
    }, []);

    // 从 Summary / MindMap 向 AI 提问
    const handleAskAI = useCallback((question) => {
        if (!question) return;
        handleSubmit(question, []);
    }, [handleSubmit]);

    const handleNavigateToParagraph = useCallback((paragraphId) => {
        if (!paragraphId) return;
        window.dispatchEvent(new CustomEvent('vibereader:navigate-paragraph', {
            detail: { paragraphId },
        }));
    }, []);

    // Listen for paragraph selections from PdfViewer to sync with the left Skim Map.
    useEffect(() => {
        const handleSelectParagraph = (event) => {
            const paragraphId = event.detail?.paragraphId;
            if (!paragraphId) return;
            setSelectedParagraphId(paragraphId);
        };
        window.addEventListener('vibereader:select-paragraph', handleSelectParagraph);
        return () => window.removeEventListener('vibereader:select-paragraph', handleSelectParagraph);
    }, []);

    const handleAiPaneDragEnter = useCallback((event) => {
        if (!hasDragInjectData(event.dataTransfer)) return;
        event.preventDefault();
        setDragInjectActive(true);
    }, []);

    const handleAiPaneDragOver = useCallback((event) => {
        if (!hasDragInjectData(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = DRAG_INJECT_EFFECT;
        setDragInjectActive(true);
    }, []);

    const handleAiPaneDragLeave = useCallback((event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget && event.currentTarget.contains(nextTarget)) return;
        setDragInjectActive(false);
    }, []);

    const handleAiPaneDrop = useCallback((event) => {
        const payload = readDragInjectData(event.dataTransfer);
        setDragInjectActive(false);
        if (!payload) return;

        event.preventDefault();
        event.stopPropagation();
        setRightToolTab('chat');
        setPendingDragInjection({
            id: createDragInjectDraftId(),
            text: formatDragInjectQuote(payload),
        });
    }, [setRightToolTab]);

    const handleChatInputDragInjectHandled = useCallback(() => {
        setDragInjectActive(false);
    }, []);

    const modelConfigValidation = validateRunnableModelConfig(selectedModel?.config);
    const modelConfigReady = modelConfigValidation.ok;
    const modelConfigButtonLabel = modelConfigReady
        ? t('ai-chat-model-service-current', { model: formatCustomModelLabel(modelConfigValidation.config.model) })
        : t('ai-chat-model-service-configure');
    const handleOpenModelConfig = useCallback(() => {
        setRightToolTab('chat');
        setModelConfigOpenSignal((value) => value + 1);
    }, [setRightToolTab]);

    // 新建会话
    const handleNewSession = useCallback(() => {
        const newId = generateSessionId();
        setCurrentSessionId(newId);
        setMessages([]);
        clearPdf();
        aiService.clearHistory();
    }, []);

    // 切换会话
    const handleSwitchSession = useCallback(async (sessionId) => {
        setCurrentSessionId(sessionId);
        const msgs = await loadConversation(sessionId);
        setMessages(msgs || []);
        // 重建服务历史
        aiService.clearHistory();
        if (msgs) {
            msgs.forEach(msg => {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    // 简化：只重建文本历史，图片不重建
                    const content = typeof msg.content === 'string' ? msg.content : '';
                    if (content) {
                        aiService.addMessage(msg.role, content);
                    }
                }
            });
        }
    }, []);

    // 删除会话
    const handleDeleteSession = useCallback(async (sessionId) => {
        await deleteConversation(sessionId);
        const list = await listConversations();
        setSessions(list);
        if (sessionId === currentSessionIdRef.current) {
            if (list.length > 0) {
                await handleSwitchSession(list[0].sessionId);
            } else {
                handleNewSession();
            }
        }
    }, [handleSwitchSession, handleNewSession, setSessions]);

    // 清空当前会话
    const handleClearHistory = useCallback(() => {
        Modal.confirm({
            title: t('ai-chat-confirm-clear'),
            content: t('ai-chat-clear-body'),
            okText: '确认',
            cancelText: t('general-cancel'),
            onOk: async () => {
                aiService.clearHistory();
                setMessages([]);
                if (currentSessionIdRef.current) {
                    await saveConversation(currentSessionIdRef.current, []);
                }
                antMessage.success(t('ai-chat-cleared'));
            }
        });
    }, [setMessages]);

    // 渲染用户消息内容
    const renderUserMessageContent = useCallback((msg) => {
        return (
            <div>
                <div>{msg.content}</div>
                {msg.images && msg.images.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {msg.images.map((img, idx) => (
                            <img
                                key={idx}
                                src={chatImageDataUrl(img)}
                                alt={img.name || ''}
                                style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8 }}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }, []);

    const handleWorkspaceDividerMouseDown = useCallback((event) => {
        event.preventDefault();
        const container = event.currentTarget.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        const handleMouseMove = (moveEvent) => {
            const nextRatio = (moveEvent.clientX - rect.left) / rect.width;
            setWorkspaceSplitRatio(nextRatio);
        };

        const stopDragging = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', stopDragging);
            document.body.classList.remove('workspace-resizing');
        };

        document.body.classList.add('workspace-resizing');
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopDragging);
    }, [setWorkspaceSplitRatio]);

    // 获取会话标题
    const getSessionTitle = useCallback((session) => {
        if (!session) return t('ai-chat-empty-session');
        if (session.title) return session.title;
        return `Session ${session.sessionId.slice(-6)}`;
    }, []);

    if (!historyLoaded) {
        return (
            <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            {/* 侧边栏 */}
            {!sidebarCollapsed && (
                <div style={{
                    width: 260,
                    borderRight: '1px solid #e0e0e0',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#f5f5f5'
                }}>
                    {/* Logo 区域 */}
                    <div style={{ padding: '16px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {vibeReaderLogo}
                        <span style={{ fontSize: 16, fontWeight: 600 }}>VibeReader Dev</span>
                    </div>

                    {/* 新会话按钮 */}
                    <div style={{ padding: '8px 12px' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleNewSession} block>
                            {t('ai-chat-new-session')}
                        </Button>
                    </div>

                    {/* PDF 上传 */}
                    <div style={{ padding: '0 12px 12px' }}>
                        <div
                            onClick={handleOpenDocument}
                            onDrop={handleDocumentDrop}
                            onDragOver={(e) => e.preventDefault()}
                            style={{
                                border: '2px dashed #d9d9d9',
                                borderRadius: 6,
                                padding: 12,
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: '#fff'
                            }}
                        >
                            <FilePdfOutlined style={{ fontSize: 24, color: currentDocument ? '#52c41a' : '#999' }} />
                            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                {pdfParsing
                                    ? t('ai-chat-pdf-parsing')
                                    : currentDocument
                                        ? `${currentDocument.name}`
                                        : t('ai-chat-pdf-upload-drag')
                                }
                            </div>
                            <Button
                                type="link"
                                size="small"
                                icon={<FolderOpenOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDocument();
                                }}
                                style={{ padding: 0, height: 22, marginTop: 4 }}
                            >
                                {t('ai-chat-open-local-file', null, '打开文件')}
                            </Button>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={SUPPORTED_DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleDocumentFile(file);
                                e.target.value = '';
                            }}
                        />
                    </div>

                    {documents.length > 0 && (
                        <div style={{ padding: '0 12px 12px' }}>
                            <div style={{ fontSize: 12, color: '#999', marginBottom: 8, fontWeight: 500 }}>
                                Recent documents
                            </div>
                            {documents.slice(0, 5).map((document) => (
                                <button
                                    key={document.id}
                                    type="button"
                                    onClick={() => {
                                        if (document.isRecentOnly) {
                                            antMessage.info('请重新打开本地文件以恢复阅读内容。');
                                            return;
                                        }
                                        setActiveDocument(document.id);
                                    }}
                                    title={document.path || document.name}
                                    style={{
                                        width: '100%',
                                        padding: '8px 10px',
                                        border: 'none',
                                        borderRadius: 6,
                                        marginBottom: 4,
                                        cursor: 'pointer',
                                        background: document.id === currentDocument?.id ? '#e6f4ff' : 'transparent',
                                        color: '#262626',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                        textAlign: 'left',
                                    }}
                                >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                                        {document.name}
                                    </span>
                                    <span style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', flexShrink: 0 }}>
                                        {document.kind}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* 会话列表 */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: 8, fontWeight: 500 }}>
                            {t('ai-chat-session-list')}
                        </div>
                        {sessions.map(session => (
                            <div
                                key={session.sessionId}
                                onClick={() => handleSwitchSession(session.sessionId)}
                                style={{
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    marginBottom: 4,
                                    cursor: 'pointer',
                                    background: session.sessionId === currentSessionId ? '#e6e6e6' : 'transparent',
                                    fontSize: 13,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                    {getSessionTitle(session)}
                                </span>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.sessionId); }}
                                    style={{ padding: '0 4px', opacity: 0.5 }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 主区域 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* 头部 */}
                <div style={{
                    padding: '0 16px',
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#fff',
                    flexShrink: 0
                }}>
                    <Button
                        type="text"
                        icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        style={{ marginRight: 8 }}
                    />
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>Workspace</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                        <Button
                            size="small"
                            type={modelConfigReady ? 'default' : 'primary'}
                            icon={<SettingOutlined />}
                            onClick={handleOpenModelConfig}
                            title={modelConfigReady ? modelConfigButtonLabel : modelConfigValidation.message}
                        >
                            {modelConfigButtonLabel}
                        </Button>
                        {rightToolTab === 'chat' && (
                            <>
                                <Button
                                    type="text"
                                    icon={<FontSizeOutlined />}
                                    onClick={() => setShowFontSlider(!showFontSlider)}
                                />
                                {showFontSlider && (
                                    <div style={{ width: 120 }}>
                                        <Slider
                                            min={0.8}
                                            max={1.5}
                                            step={0.1}
                                            value={fontScale}
                                            onChange={handleFontScaleChange}
                                        />
                                    </div>
                                )}
                                <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={handleClearHistory}
                                >
                                    {t('ai-chat-clear-history')}
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <div className="workspace-body">
                    <div
                        className="workspace-reading-surface"
                        style={{ flexBasis: `${workspaceSplitRatio * 100}%` }}
                    >
                        <aside
                            className="workspace-skim-map-pane"
                            role="complementary"
                            aria-label="Skim Map"
                        >
                            <Suspense fallback={<PanelFallback />}>
                                <ThinkingTreePanel
                                    documentId={currentDocument?.id}
                                    title="Skim Map"
                                    generateLabel="生成 Skim Map"
                                    progressText="正在生成文档阅读地图..."
                                    onAskAI={handleAskAI}
                                    onNavigateToParagraph={handleNavigateToParagraph}
                                    activeParagraphId={selectedParagraphId}
                                    style={{ flex: 1 }}
                                />
                            </Suspense>
                        </aside>

                        <section className="workspace-reader-pane">
                            <div className="workspace-pane-header">
                                <span><FileTextOutlined /> {currentDocument?.name || 'Reader'}</span>
                                <span className="workspace-pane-meta">
                                    {currentDocument?.kind === 'pdf' && pdfText
                                        ? t('ai-chat-pdf-parsed', { pages: pdfPages })
                                        : currentDocument?.kind || t('ai-chat-pdf-upload-drag')}
                                </span>
                            </div>
                            <div className="workspace-pane-content">
                                {currentDocument && currentDocument.kind !== 'pdf' ? (
                                    <DocumentReader document={currentDocument} onInject={handleInjectDocumentText} style={{ flex: 1, minHeight: 0 }} />
                                ) : (
                                    <PdfViewer
                                        onInject={handleInjectPdfText}
                                        onGenerateLensCard={handleGenerateLensCard}
                                        onPageChange={setActiveReaderPage}
                                        documentId={currentDocument?.id}
                                        insights={insights}
                                        style={{ flex: 1, minHeight: 0 }}
                                    />
                                )}
                            </div>
                        </section>
                    </div>

                    <div
                        className="workspace-divider"
                        role="separator"
                        aria-orientation="vertical"
                        onMouseDown={handleWorkspaceDividerMouseDown}
                    />

                    <section
                        className={`workspace-ai-pane${dragInjectActive ? ' drag-over' : ''}`}
                        onDragEnter={handleAiPaneDragEnter}
                        onDragLeave={handleAiPaneDragLeave}
                        onDragOver={handleAiPaneDragOver}
                        onDrop={handleAiPaneDrop}
                    >
                        <Tabs
                            activeKey={rightToolTab}
                            onChange={setRightToolTab}
                            size="small"
                            className="workspace-ai-tabs"
                            items={[
                                { key: 'summary', label: <span><ThunderboltOutlined /> {t('ai-chat-tab-summary')}</span> },
                                { key: 'flashcard', label: <span><BookOutlined /> {t('ai-chat-tab-cards')}</span> },
                                { key: 'navigator', label: <span><CompassOutlined /> {t('ai-chat-tab-navigator')}</span> },
                                { key: 'artifacts', label: <span><FileTextOutlined /> {t('ai-chat-tab-notes')}</span> },
                                { key: 'tasks', label: <span><ClockCircleOutlined /> Tasks</span> },
                                { key: 'chat', label: <span><CommentOutlined /> {t('ai-chat-tab-chat')}</span> },
                            ]}
                        />

                        <div className="workspace-ai-content">
                            {rightToolTab === 'chat' && (
                                <div className="workspace-chat-context-bar">
                                    <span className="workspace-chat-context-label">Context</span>
                                    <Segmented
                                        size="small"
                                        aria-label="Chat context"
                                        value={chatContextMode}
                                        onChange={setChatContextMode}
                                        options={[
                                            { label: 'Relevant', value: 'relevant' },
                                            { label: 'Current page', value: 'page' },
                                            { label: 'Current section', value: 'section', disabled: !activeSection },
                                            { label: 'Selected paragraph', value: 'paragraph', disabled: !selectedParagraphId },
                                        ]}
                                    />
                                    <span className="workspace-chat-context-page">
                                        P{activeReaderPage || 1}{activeSection?.title ? ` · ${activeSection.title}` : ''}
                                    </span>
                                </div>
                            )}

                            {rightToolTab === 'chat' && (
                                <div
                                    ref={messagesContainerRef}
                                    className="workspace-messages"
                                >
                                    {messages.length === 0 && (
                                        <div className="workspace-empty-chat">
                                            {vibeReaderLogo}
                                            <div style={{ marginTop: 16, fontSize: 16 }}>
                                                {t('ai-chat-empty-session')}
                                            </div>
                                        </div>
                                    )}
                                    {messages.map((msg) => (
                                        <div key={msg.id} style={{ marginBottom: 16, fontSize: `${14 * fontScale}px` }}>
                                            <Bubble
                                                placement={roles[msg.role]?.placement || 'start'}
                                                variant={roles[msg.role]?.variant || 'shadow'}
                                                loading={msg.typing}
                                                loadingRender={msg.role === 'assistant' ? roles.assistant.loadingRender : undefined}
                                                content={
                                                    msg.role === 'assistant' ? (
                                                        <div>
                                                            {msg.hasThinking && msg.thinking && (
                                                                <details style={{ marginBottom: 8, fontSize: `${12 * fontScale}px` }}>
                                                                    <summary style={{ color: '#888', cursor: 'pointer', userSelect: 'none' }}>
                                                                        {t('ai-chat-thinking', null, 'Thinking')} ({msg.thinking.length})
                                                                    </summary>
                                                                    <div style={{
                                                                        padding: 8,
                                                                        background: '#f8f9fa',
                                                                        borderRadius: 4,
                                                                        color: '#666',
                                                                        marginTop: 4,
                                                                        whiteSpace: 'pre-wrap',
                                                                        lineHeight: 1.5,
                                                                        maxHeight: 300,
                                                                        overflow: 'auto',
                                                                    }}>
                                                                        {msg.thinking}
                                                                    </div>
                                                                </details>
                                                            )}
                                                            <MarkdownRenderer content={msg.content} onExplainCode={handleAskAI} />
                                                            <AssistantSourceRefs
                                                                sourceRefs={msg.sourceRefs}
                                                                onNavigate={handleNavigateSourceRef}
                                                            />
                                                            {!msg.typing && msg.content && (
                                                                <div className="assistant-message-actions">
                                                                    <Button
                                                                        size="small"
                                                                        type="text"
                                                                        onClick={() => handleSaveAssistantAnswerCard(msg)}
                                                                    >
                                                                        保存回答卡片
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        renderUserMessageContent(msg)
                                                    )
                                                }
                                            />
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            )}
                            {rightToolTab === 'summary' && (
                                <Suspense fallback={<PanelFallback />}>
                                    <SummaryPanel
                                        documentId={currentDocument?.id}
                                        onAskAI={handleAskAI}
                                        onArtifactCreated={handleArtifactCreated}
                                        style={{ flex: 1 }}
                                    />
                                </Suspense>
                            )}
                            {rightToolTab === 'flashcard' && (
                                <Suspense fallback={<PanelFallback />}>
                                    <FlashcardDeck documentId={currentDocument?.id} style={{ flex: 1 }} />
                                </Suspense>
                            )}
                            {rightToolTab === 'navigator' && (
                                <Suspense fallback={<PanelFallback />}>
                                    <AttentionNavigatorPanel
                                        documentId={currentDocument?.id}
                                        onNavigateToParagraph={handleNavigateToParagraph}
                                        onInsightsChange={setInsights}
                                        onArtifactCreated={handleArtifactCreated}
                                        onAskAI={handleAskAI}
                                        style={{ flex: 1 }}
                                    />
                                </Suspense>
                            )}
                            {rightToolTab === 'artifacts' && (
                                <Suspense fallback={<PanelFallback />}>
                                    <ArtifactPanel
                                        documentId={currentDocument?.id}
                                        artifacts={artifacts}
                                        onNavigateToSource={handleNavigateArtifactSource}
                                        onArtifactUpdated={handleArtifactUpdated}
                                        onArtifactDeleted={handleArtifactDeleted}
                                    />
                                </Suspense>
                            )}
                            {rightToolTab === 'tasks' && (
                                <Suspense fallback={<PanelFallback />}>
                                    <TaskStatusPanel
                                        documentId={currentDocument?.id}
                                        onRetryTask={handleRetryTask}
                                        onStartAgentTask={handleStartAgentTask}
                                        onSaveTaskResult={handleSaveTaskResult}
                                        style={{ flex: 1 }}
                                    />
                                </Suspense>
                            )}
                        </div>

                        {rightToolTab === 'chat' && (
                            <div className="workspace-input">
                                <ChatInput
                                    currentModel={selectedModel}
                                    onModelChange={handleModelChange}
                                    onSubmit={handleSubmit}
                                    onStop={handleStopGenerating}
                                    loading={loading}
                                    visionCapable={visionCapable}
                                    pendingInjection={pendingDragInjection}
                                    onDragInjectHandled={handleChatInputDragInjectHandled}
                                    configOpenSignal={modelConfigOpenSignal}
                                />
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement && import.meta.env.MODE !== 'test') {
    const root = createRoot(rootElement);
    root.render(<App />);
}
