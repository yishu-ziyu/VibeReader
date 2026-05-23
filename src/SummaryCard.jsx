import React, { useState, useCallback } from 'react';
import { Card, Button, Tag, Space, Spin, Collapse, Empty } from 'antd';
import {
  RobotOutlined,
  MessageOutlined,
  DownOutlined,
  RightOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { t } from './i18n';
import aiService from './aiService';

const { Panel } = Collapse;

/**
 * SummaryCard - A collapsible card for a paper section summary.
 *
 * Props:
 *   - section: { id, title, content (raw text of the section) }
 *   - onAskAI: (question: string) => void — callback to send a focused question
 *   - defaultExpanded: boolean
 */
export function SummaryCard({ section, onAskAI, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [summary, setSummary] = useState('');
  const [keyPoints, setKeyPoints] = useState([]);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!section?.content) return;
    setGenerating(true);
    try {
      const prompt = `请为以下论文段落生成简洁的学术摘要和关键要点（3-5条）。

段落标题：${section.title}
段落内容：
${section.content.slice(0, 4000)}

请按以下格式输出：
摘要：<一段简洁的摘要>
要点：
- <要点1>
- <要点2>
- <要点3>`;

      let fullText = '';
      await aiService.chatStream(
        prompt,
        ({ done, content, fullMessage }) => {
          if (!done && content) {
            fullText = fullMessage;
          }
        },
        { includeHistory: false, systemPrompt: null }
      );

      // Parse result
      const summaryMatch = fullText.match(/摘要[:：]\s*([\s\S]*?)(?=要点[:：]|$)/i);
      const pointsMatch = fullText.match(/要点[:：]\s*([\s\S]*)/i);

      if (summaryMatch) {
        setSummary(summaryMatch[1].trim());
      } else {
        setSummary(fullText.slice(0, 300));
      }

      if (pointsMatch) {
        const points = pointsMatch[1]
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('-') || l.startsWith('•'))
          .map((l) => l.replace(/^[-•]\s*/, '').trim())
          .filter(Boolean);
        setKeyPoints(points);
      }
    } catch (e) {
      setSummary(t('ai-chat-summary-error', null, 'Failed to generate summary'));
    } finally {
      setGenerating(false);
    }
  }, [section]);

  const handleAskAboutSection = useCallback(() => {
    if (onAskAI) {
      onAskAI(`请详细解释「${section.title}」这部分的内容和意义。`);
    }
  }, [onAskAI, section]);

  const hasSummary = summary || keyPoints.length > 0;

  return (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        borderRadius: 8,
        border: '1px solid var(--fill-quinary)',
        background: 'var(--material-background)',
      }}
      bodyStyle={{ padding: 12 }}
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <DownOutlined style={{ fontSize: 12, color: 'var(--fill-tertiary)' }} />
          ) : (
            <RightOutlined style={{ fontSize: 12, color: 'var(--fill-tertiary)' }} />
          )}
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fill-primary)' }}>
            {section.title}
          </span>
          {hasSummary && (
            <Tag color="blue" style={{ fontSize: 11, marginLeft: 'auto' }}>
              <BulbOutlined /> {keyPoints.length}
            </Tag>
          )}
        </div>
      }
    >
      {expanded && (
        <div>
          {!hasSummary && !generating && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ color: 'var(--fill-tertiary)', fontSize: 13 }}>
                    {t('ai-chat-summary-empty', null, 'No summary yet')}
                  </span>
                }
              />
              <Button
                type="primary"
                icon={<RobotOutlined />}
                onClick={handleGenerate}
                style={{ marginTop: 8 }}
                size="small"
              >
                {t('ai-chat-generate-summary', null, 'Generate Summary')}
              </Button>
            </div>
          )}

          {generating && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin size="small" />
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--fill-tertiary)' }}>
                {t('ai-chat-summary-generating', null, 'Generating summary...')}
              </div>
            </div>
          )}

          {hasSummary && !generating && (
            <div>
              {summary && (
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--fill-secondary)',
                    marginBottom: 12,
                    padding: 10,
                    background: 'var(--material-sidepane)',
                    borderRadius: 6,
                    borderLeft: '3px solid var(--accent-blue)',
                  }}
                >
                  {summary}
                </div>
              )}

              {keyPoints.length > 0 && (
                <ul
                  style={{
                    margin: '0 0 12px 0',
                    paddingLeft: 18,
                    fontSize: 13,
                    color: 'var(--fill-primary)',
                  }}
                >
                  {keyPoints.map((pt, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>
                      {pt}
                    </li>
                  ))}
                </ul>
              )}

              <Space>
                <Button
                  size="small"
                  icon={<RobotOutlined />}
                  onClick={handleGenerate}
                >
                  {t('ai-chat-regenerate', null, 'Regenerate')}
                </Button>
                <Button
                  size="small"
                  icon={<MessageOutlined />}
                  onClick={handleAskAboutSection}
                >
                  {t('ai-chat-ask-about', null, 'Ask AI')}
                </Button>
              </Space>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
