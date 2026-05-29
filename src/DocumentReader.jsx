import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import MarkdownRenderer from './MarkdownRenderer';
import { sanitizeHtmlToText } from './services/documentService';

function getReadableContent(document) {
    if (!document?.contentText) return '';
    if (document.kind === 'html') return sanitizeHtmlToText(document.contentText);
    return document.contentText;
}

export function DocumentReader({ document: activeDocument, onInject, style = {} }) {
    const containerRef = useRef(null);
    const [selection, setSelection] = useState(null);
    const content = useMemo(() => getReadableContent(activeDocument), [activeDocument]);

    useEffect(() => {
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    }, [activeDocument?.id]);

    useEffect(() => {
        const handleSelectionChange = () => {
            const sel = window.getSelection();
            const text = sel?.toString().trim() || '';
            if (text && containerRef.current?.contains(sel.anchorNode)) {
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

    if (!activeDocument || !content) {
        return (
            <div className="document-reader-empty" style={style}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="打开 PDF、Markdown、Text 或 HTML 文件开始阅读" />
            </div>
        );
    }

    return (
        <div className="document-reader" style={style}>
            <div ref={containerRef} className="document-reader-scroll">
                {activeDocument.kind === 'markdown' && (
                    <div className="document-reader-markdown">
                        <MarkdownRenderer content={content} />
                    </div>
                )}
                {activeDocument.kind === 'html' && (
                    <article className="document-reader-text" data-testid="html-document-content">
                        {content}
                    </article>
                )}
                {activeDocument.kind === 'text' && (
                    <article className="document-reader-text" data-testid="text-document-content" style={{ whiteSpace: 'pre-wrap' }}>
                        {content}
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
