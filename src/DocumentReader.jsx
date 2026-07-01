import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, message as antMessage } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import MarkdownRenderer from './MarkdownRenderer';
import { sanitizeHtmlToText } from './services/documentService';
import { createDragInjectPayload, DEFAULT_DRAG_REFERENCE_PAGE, writeDragInjectData } from './dragInject';

function getReadableContent(document) {
    if (!document?.contentText) return '';
    if (document.kind === 'html') return sanitizeHtmlToText(document.contentText);
    return document.contentText;
}

function readableChunks(content = '') {
    return String(content || '')
        .split(/\n{2,}/)
        .map((text) => text.trim())
        .filter(Boolean);
}

function normalizeSearchText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function DocumentReader({ document: activeDocument, onInject, style = {} }) {
    const containerRef = useRef(null);
    const [selection, setSelection] = useState(null);
    const content = useMemo(() => getReadableContent(activeDocument), [activeDocument]);
    const chunks = useMemo(() => readableChunks(content), [content]);

    useEffect(() => {
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    }, [activeDocument?.id]);

    useEffect(() => {
        const handleSelectionChange = () => {
            const sel = window.getSelection();
            const text = sel?.toString().trim() || '';
            const container = containerRef.current;
            const isInsideReader = !!container && !!sel && (
                container.contains(sel.anchorNode) ||
                container.contains(sel.focusNode) ||
                (sel.rangeCount > 0 && sel.getRangeAt(0).intersectsNode(container))
            );
            if (text && isInsideReader) {
                setSelection(text);
            } else {
                setSelection(null);
            }
        };

        globalThis.document.addEventListener('selectionchange', handleSelectionChange);
        return () => globalThis.document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    const handleInject = useCallback(() => {
        if (!selection || !onInject) return;
        onInject(selection);
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    }, [onInject, selection]);

    const handleDragStart = useCallback((event) => {
        const payload = createDragInjectPayload({
            text: selection,
            page: DEFAULT_DRAG_REFERENCE_PAGE,
            source: activeDocument?.kind || 'document',
        });
        if (!payload) return;
        writeDragInjectData(event.dataTransfer, payload);
    }, [activeDocument?.kind, selection]);

    const highlightParagraph = useCallback((paragraphId) => {
        const container = containerRef.current;
        if (!container || !paragraphId) return false;
        const target = container.querySelector(`[data-paragraph-id="${paragraphId}"]`);
        if (!target) return false;

        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.classList.add('paragraph-pulse-highlight');
        window.setTimeout(() => {
            target.classList.remove('paragraph-pulse-highlight');
        }, 3000);
        return true;
    }, []);

    const highlightClosestText = useCallback((text) => {
        const container = containerRef.current;
        const normalizedText = normalizeSearchText(text);
        if (!container || !normalizedText) return false;
        const paragraphs = [...container.querySelectorAll('[data-paragraph-id]')];
        const target = paragraphs.find((paragraph) => {
            const paragraphText = normalizeSearchText(paragraph.textContent || '');
            return paragraphText.includes(normalizedText) ||
                (normalizedText.length >= 24 && normalizedText.includes(paragraphText));
        });
        if (!target) return false;

        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.classList.add('paragraph-pulse-highlight');
        window.setTimeout(() => {
            target.classList.remove('paragraph-pulse-highlight');
        }, 3000);
        return true;
    }, []);

    useEffect(() => {
        const handleNavigateParagraph = (event) => {
            const detail = event.detail || {};
            if (detail.documentId && activeDocument?.id && detail.documentId !== activeDocument.id) return;
            const navigated = detail.paragraphId
                ? highlightParagraph(detail.paragraphId) || highlightClosestText(detail.text)
                : highlightClosestText(detail.text);
            if (!navigated) {
                antMessage.warning('未找到这张卡片的原文段落');
            }
        };

        window.addEventListener('vibereader:navigate-paragraph', handleNavigateParagraph);
        window.addEventListener('vibereader:navigate-source-span', handleNavigateParagraph);
        return () => {
            window.removeEventListener('vibereader:navigate-paragraph', handleNavigateParagraph);
            window.removeEventListener('vibereader:navigate-source-span', handleNavigateParagraph);
        };
    }, [activeDocument?.id, highlightClosestText, highlightParagraph]);

    if (!activeDocument || !content) {
        return (
            <div className="document-reader-empty" style={style}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="打开 PDF、Markdown、Text 或 HTML 文件开始阅读" />
            </div>
        );
    }

    return (
        <div className="document-reader" style={style}>
            <div
                ref={containerRef}
                className="document-reader-scroll"
                draggable={!!selection}
                onDragStart={handleDragStart}
            >
                {activeDocument.kind === 'markdown' && (
                    <div className="document-reader-markdown">
                        {chunks.map((chunk, index) => (
                            <div
                                key={`${activeDocument.id || 'document'}-chunk-${index + 1}`}
                                data-paragraph-id={`chunk-${index + 1}`}
                                className="document-reader-paragraph"
                            >
                                <MarkdownRenderer content={chunk} />
                            </div>
                        ))}
                    </div>
                )}
                {activeDocument.kind === 'html' && (
                    <article className="document-reader-text" data-testid="html-document-content">
                        {chunks.map((chunk, index) => (
                            <p
                                key={`${activeDocument.id || 'document'}-chunk-${index + 1}`}
                                data-paragraph-id={`chunk-${index + 1}`}
                                className="document-reader-paragraph"
                            >
                                {chunk}
                            </p>
                        ))}
                    </article>
                )}
                {activeDocument.kind === 'text' && (
                    <article className="document-reader-text" data-testid="text-document-content" style={{ whiteSpace: 'pre-wrap' }}>
                        {chunks.map((chunk, index) => (
                            <p
                                key={`${activeDocument.id || 'document'}-chunk-${index + 1}`}
                                data-paragraph-id={`chunk-${index + 1}`}
                                className="document-reader-paragraph"
                            >
                                {chunk}
                            </p>
                        ))}
                    </article>
                )}
            </div>
            {selection && (
                <Button
                    type="primary"
                    size="small"
                    icon={<MessageOutlined />}
                    className="document-reader-inject"
                    onClick={handleInject}
                >
                    注入 AI
                </Button>
            )}
        </div>
    );
}

export default DocumentReader;
