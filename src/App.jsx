import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bubble } from '@ant-design/x';
import { Button, Flex, message as antMessage, Spin, Modal, Slider, Tabs } from 'antd';
import { FontSizeOutlined, DeleteOutlined, PlusOutlined, FilePdfOutlined, FolderOpenOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CommentOutlined, FileTextOutlined, BookOutlined, BranchesOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ChatInput from './ChatInput';
import aiService from './aiService';
import { MULTIMODAL_UNSUPPORTED_CODE } from './multimodalApiError';
import { buildChatHardFailureBubbleContent } from './chatHardFailureContent';
import { t, formatCustomModelLabel } from './i18n';
import MarkdownRenderer from './MarkdownRenderer';
import { extractTextFromPDF } from './pdfService';
import { fileToDocument, openTauriDocument } from './services/documentService';
import { isVisionCapableByModelName } from './modelPresets';
import {
    saveConversation, loadConversation, listConversations, deleteConversation,
    getFontScale, setFontScale, getModelConfigs, getSelectedConfigId
} from './storage';
import { useConversationStore, useDocumentStore, useModelStore, usePdfStore, useUIStore } from './store';
import { useVibeStore } from './store';
import { PdfViewer } from './PdfViewer';
import { SummaryPanel } from './SummaryPanel';
import { FlashcardDeck } from './FlashcardDeck';
import { MindMap } from './MindMap';
import './styles.css';
import viberoIconPng from '../icons/vibero.png';

/** 附图仅 data URL */
function chatImageDataUrl(img) {
    return img && typeof img.base64 === 'string' && img.base64 ? img.base64 : '';
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

// Vibero Logo
const viberoLogo = (
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

function App() {
    // Zustand stores
    const { messages, loading, sessions, currentSessionId, historyLoaded, setMessages, setLoading, setSessions, setCurrentSessionId, setHistoryLoaded } = useConversationStore();
    const { selectedModel, visionCapable, selectModel } = useModelStore();
    const { pdfText, pdfPages, pdfParsing, clearPdf, startParsing, finishParsing, failParsing } = usePdfStore();
    const { fontScale, showFontSlider, sidebarCollapsed, activeToolTab, setFontScale: setFontScaleState, setShowFontSlider, setSidebarCollapsed, setActiveToolTab } = useUIStore();
    const { addDocument } = useDocumentStore();

    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const currentSessionIdRef = useRef(currentSessionId);

    useEffect(() => {
        currentSessionIdRef.current = currentSessionId;
    }, [currentSessionId]);

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

    // 获取当前 AI 服务实例
    const getCurrentService = useCallback(() => {
        const config = selectedModel.config;
        if (!config) return null;
        const apiType = config.apiFormat === 'anthropic' ? 'anthropic-compatible' : 'openai-compatible';
        aiService.setConfig({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: config.modelName,
            apiType
        });
        return aiService;
    }, [selectedModel]);

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
            addDocument(document);
            finishParsing(text, pages);
            setActiveToolTab('pdf');
            // 触发 VIBE 解析
            useVibeStore.getState().parsePdfText(text);
            // 注入到当前服务
            const service = getCurrentService();
            if (service) {
                service.clearHistory();
                service.setPaperContext(text);
            }
            antMessage.success(t('ai-chat-pdf-parsed', { pages }));
        } catch (error) {
            console.error('[App] PDF parsing failed:', error);
            antMessage.error(t('ai-chat-pdf-parse-failed'));
            failParsing();
        }
    }, [addDocument, finishParsing, getCurrentService, setActiveToolTab, startParsing, failParsing]);

    const handlePdfDrop = useCallback((e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handlePdfUpload(file);
    }, [handlePdfUpload]);

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

            if (document.kind !== 'pdf') {
                antMessage.info(t('ai-chat-document-kind-pending', {
                    kind: document.kind,
                }, '该格式已纳入后续阅读器阶段；当前请先打开 PDF。'));
                return;
            }

            await handlePdfUpload(document.file, document);
        } catch (error) {
            console.error('[App] Failed to open document:', error);
            antMessage.error(t('ai-chat-document-open-failed', null, '打开文件失败，请重试或使用拖拽上传。'));
        }
    }, [handlePdfUpload]);

    // 发送消息
    const handleSubmit = useCallback(async (text, images) => {
        if ((!text || !text.trim()) && (!images || images.length === 0)) return;

        const service = getCurrentService();
        if (!service) {
            antMessage.error(t('vibe-ai-chat-prompt-configure-custom-first'));
            return;
        }

        setLoading(true);

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
        let messageContent = text;
        const sendImages = (images || []).filter((img) => chatImageDataUrl(img));
        if (sendImages.length > 0) {
            messageContent = [{ type: 'text', text }];
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
            typing: true,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMessage, aiMessage]);

        // 请求硬失败时统一处理
        const performChat = async () => {
            try {
                await service.chatStream(
                    messageContent,
                    ({ done, content, fullMessage, thinking, fullThinking, hasThinking, interrupted, error, errorCode }) => {
                        if (!done && (content || thinking)) {
                            setMessages(prev => prev.map(msg =>
                                msg.id === aiMessageId
                                    ? { ...msg, content: fullMessage, thinking: fullThinking, hasThinking, typing: true }
                                    : msg
                            ));
                        } else if (done) {
                            let finalContent = fullMessage;
                            const isMmRejected = interrupted && errorCode === MULTIMODAL_UNSUPPORTED_CODE;
                            const streamFailedHard = interrupted && !!error && !isMmRejected;

                            if (interrupted) {
                                if (isMmRejected) {
                                    finalContent = t('vibe-ai-chat-multimodal-not-supported', {
                                        model: selectedModel.label,
                                    });
                                } else if (streamFailedHard) {
                                    finalContent = buildChatHardFailureBubbleContent(String(error), {
                                        modelLabel: selectedModel.label,
                                        multimodalRejectedCode: errorCode,
                                    });
                                }
                            }

                            const finalMsg = {
                                id: aiMessageId,
                                role: 'assistant',
                                content: finalContent,
                                thinking: fullThinking,
                                hasThinking,
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
                        }
                    },
                    { systemPrompt: SYSTEM_PROMPT }
                );
            } catch (error) {
                console.error('[App] Chat error:', error);
                setMessages(prev => {
                    const updated = prev.filter(m => m.id !== aiMessageId);
                    persistMessages(updated);
                    return updated;
                });
                antMessage.error('发送失败: ' + error.message);
                setLoading(false);
            }
        };

        performChat();
    }, [getCurrentService, selectedModel, persistMessages]);

    // 从 PDF 段落注入到聊天
    const handleInjectPdfText = useCallback((text) => {
        if (!text) return;
        const prefix = t('ai-chat-pdf-context-prefix', null, 'Based on the following paper content:\n');
        handleSubmit(prefix + text, []);
    }, [handleSubmit]);

    // 从 Summary / MindMap 向 AI 提问
    const handleAskAI = useCallback((question) => {
        if (!question) return;
        handleSubmit(question, []);
    }, [handleSubmit]);

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
                        {viberoLogo}
                        <span style={{ fontSize: 16, fontWeight: 600 }}>AI Chat</span>
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
                            onDrop={handlePdfDrop}
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
                            <FilePdfOutlined style={{ fontSize: 24, color: pdfText ? '#52c41a' : '#999' }} />
                            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                {pdfParsing
                                    ? t('ai-chat-pdf-parsing')
                                    : pdfText
                                        ? t('ai-chat-pdf-parsed', { pages: pdfPages })
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
                            accept=".pdf"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePdfUpload(file);
                                e.target.value = '';
                            }}
                        />
                    </div>

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
                    <Tabs
                        activeKey={activeToolTab}
                        onChange={setActiveToolTab}
                        size="small"
                        style={{ flex: 1, minWidth: 0 }}
                        items={[
                            { key: 'chat', label: <span><CommentOutlined /> {t('ai-chat-empty-session')}</span> },
                            { key: 'pdf', label: <span><FileTextOutlined /> PDF</span> },
                            { key: 'summary', label: <span><ThunderboltOutlined /> {t('ai-chat-summary-panel-title', null, 'Summary')}</span> },
                            { key: 'flashcard', label: <span><BookOutlined /> {t('ai-chat-flashcard-title', null, 'Flashcards')}</span> },
                            { key: 'mindmap', label: <span><BranchesOutlined /> {t('ai-chat-mindmap-title', null, 'Mind Map')}</span> },
                        ]}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                        {activeToolTab === 'chat' && (
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

                {/* Tab 内容区 */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
                    {activeToolTab === 'chat' && (
                        <>
                            {/* 消息列表 */}
                            <div
                                ref={messagesContainerRef}
                                style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '16px 20px',
                                    background: '#fafafa'
                                }}
                            >
                                {messages.length === 0 && (
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        color: '#999'
                                    }}>
                                        {viberoLogo}
                                        <div style={{ marginTop: 16, fontSize: 16 }}>
                                            {t('ai-chat-empty-session')}
                                        </div>
                                        <div style={{ marginTop: 8, fontSize: 13 }}>
                                            Upload a PDF or start chatting
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
                        </>
                    )}
                    {activeToolTab === 'pdf' && (
                        <PdfViewer onInject={handleInjectPdfText} style={{ flex: 1 }} />
                    )}
                    {activeToolTab === 'summary' && (
                        <SummaryPanel onAskAI={handleAskAI} style={{ flex: 1 }} />
                    )}
                    {activeToolTab === 'flashcard' && (
                        <FlashcardDeck style={{ flex: 1 }} />
                    )}
                    {activeToolTab === 'mindmap' && (
                        <MindMap onAskAI={handleAskAI} style={{ flex: 1 }} />
                    )}
                </div>

                {/* 输入区 — 仅在 Chat tab 显示 */}
                {activeToolTab === 'chat' && (
                    <div style={{ padding: '8px 16px 16px', borderTop: '1px solid #e0e0e0', background: '#fff', flexShrink: 0 }}>
                        <ChatInput
                            currentModel={selectedModel}
                            onModelChange={handleModelChange}
                            onSubmit={handleSubmit}
                            loading={loading}
                            visionCapable={visionCapable}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
