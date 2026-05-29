import React, { useCallback, useState } from 'react';
import { Button, Empty, Spin, Tag, List } from 'antd';
import { CompassOutlined, AimOutlined } from '@ant-design/icons';
import { usePdfStore } from './store';
import { analyzeKeyInsights, INSIGHT_TYPES } from './attentionNavigator';
import { t } from './i18n';

function extractParagraphsFromText(pdfText) {
  const PAGE_MARKER_RE = /---\s*第\s*(\d+)\s*页\s*---/;
  const parts = String(pdfText || '').split(PAGE_MARKER_RE);
  if (parts.length === 1) return [{ page: 1, text: parts[0] }];

  const pages = [];
  if (parts[0].trim()) pages.push({ page: 1, text: parts[0] });
  for (let index = 1; index < parts.length; index += 2) {
    pages.push({ page: Number(parts[index]) || pages.length + 1, text: parts[index + 1] || '' });
  }

  return pages.flatMap(({ page, text }) =>
    text
      .split(/\n\s*\n+/)
      .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
      .filter((chunk) => chunk.length > 0 && !PAGE_MARKER_RE.test(chunk))
      .map((chunk, index) => ({
        id: `page-${page}-para-${index}`,
        text: chunk,
        page,
        y: 0,
      }))
  );
}

export function AttentionNavigatorPanel({ onNavigateToParagraph, onInsightsChange, style = {} }) {
  const { pdfText, pdfParsing } = usePdfStore();
  const [insights, setInsights] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState('');

  const handleAnalyze = useCallback(async () => {
    if (!pdfText || analyzing) return;
    const paragraphs = extractParagraphsFromText(pdfText);
    if (paragraphs.length === 0) return;

    setAnalyzing(true);
    setProgress('');
    setInsights([]);

    try {
      const results = await analyzeKeyInsights(pdfText, paragraphs, (msg) => setProgress(msg));
      setInsights(results);
      if (onInsightsChange) onInsightsChange(results);
    } catch (error) {
      console.error('[AttentionNavigator] Analysis failed:', error);
    } finally {
      setAnalyzing(false);
    }
  }, [pdfText, analyzing]);

  const handleInsightClick = useCallback((insight) => {
    if (onNavigateToParagraph && insight.paragraphId) {
      onNavigateToParagraph(insight.paragraphId);
    }
  }, [onNavigateToParagraph]);

  if (pdfParsing) {
    return (
      <div className="attention-navigator-empty" style={style}>
        <Spin size="small" />
        <div className="attention-navigator-muted">{t('ai-chat-pdf-parsing')}</div>
      </div>
    );
  }

  if (!pdfText) {
    return (
      <div className="attention-navigator-empty" style={style}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('ai-chat-no-pdf-context')}
        />
      </div>
    );
  }

  return (
    <div className="attention-navigator-panel" style={style}>
      <div className="attention-navigator-header">
        <div className="attention-navigator-title">
          <CompassOutlined />
          <span>注意力导航</span>
        </div>
      </div>

      {!analyzing && insights.length === 0 && (
        <div className="attention-navigator-generate">
          <AimOutlined className="attention-navigator-generate-icon" />
          <Button type="primary" icon={<CompassOutlined />} onClick={handleAnalyze}>
            分析关键位置
          </Button>
        </div>
      )}

      {analyzing && (
        <div className="attention-navigator-progress">
          <Spin size="small" />
          <div className="attention-navigator-muted">
            {progress || '正在分析关键位置...'}
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div className="attention-navigator-content">
          <List
            size="small"
            dataSource={insights}
            renderItem={(insight) => {
              const typeMeta = INSIGHT_TYPES[insight.type?.toUpperCase()] || {
                label: insight.type,
                color: '#999',
              };
              return (
                <List.Item
                  className="attention-navigator-item"
                  onClick={() => handleInsightClick(insight)}
                >
                  <div className="attention-navigator-item-inner">
                    <Tag
                      color={typeMeta.color}
                      style={{ fontSize: 11, marginRight: 8, flexShrink: 0 }}
                    >
                      {typeMeta.label}
                    </Tag>
                    <div className="attention-navigator-item-body">
                      <div className="attention-navigator-item-desc">
                        {insight.description}
                      </div>
                      <div className="attention-navigator-item-meta">
                        P{insight.location?.page} · {insight.paragraphId}
                      </div>
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
          <div className="attention-navigator-footer">
            <Button size="small" onClick={handleAnalyze} loading={analyzing}>
              重新分析
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AttentionNavigatorPanel;
