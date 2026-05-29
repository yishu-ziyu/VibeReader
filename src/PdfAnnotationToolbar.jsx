import React, { useCallback, useState } from 'react';
import { Button, Input } from 'antd';
import { HighlightOutlined, MessageOutlined, SaveOutlined } from '@ant-design/icons';
import { t } from './i18n';

export function PdfAnnotationToolbar({ selection, onInject, onHighlight, onSaveNote }) {
    const [note, setNote] = useState('');

    const handleSaveNote = useCallback(() => {
        if (!selection?.text || !note.trim()) return;
        onSaveNote?.(selection.text, note.trim());
        setNote('');
    }, [note, onSaveNote, selection?.text]);

    if (!selection) return null;

    return (
        <div
            className="pdf-annotation-toolbar"
            style={{
                position: 'absolute',
                left: selection.x,
                top: selection.y,
            }}
        >
            <span className="pdf-annotation-preview">{selection.text.slice(0, 30)}...</span>
            <Button
                type="primary"
                size="small"
                icon={<MessageOutlined />}
                aria-label="注入 AI"
                onClick={() => onInject?.(selection.text)}
            >
                {t('ai-chat-ask-about', null, 'Inject')}
            </Button>
            <Button
                size="small"
                icon={<HighlightOutlined />}
                onClick={() => onHighlight?.(selection.text)}
            >
                高亮
            </Button>
            <Input
                size="small"
                placeholder="笔记"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onPressEnter={handleSaveNote}
                style={{ width: 120 }}
            />
            <Button
                size="small"
                icon={<SaveOutlined />}
                onClick={handleSaveNote}
            >
                保存笔记
            </Button>
        </div>
    );
}

export default PdfAnnotationToolbar;
