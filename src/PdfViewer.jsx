import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Empty, Spin, Tooltip, Input } from 'antd';
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  ColumnWidthOutlined,
  LeftOutlined,
  RightOutlined,
  MessageOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';
import { usePdfStore } from './store';
import { useProgressStore } from './store/progressStore';
import { AgentProgressPanel } from './AgentProgressPanel';
import { t } from './i18n';

// Ensure worker is configured (matches pdfService.js)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.25;

function copyPdfData(data) {
  if (data instanceof Uint8Array) return data.slice();
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  return data;
}

/**
 * PdfViewer - Visual PDF renderer using pdf.js with TextLayer support.
 *
 * Features:
 *   - Renders PDF pages visually on canvas
 *   - TextLayer for selectable text
 *   - Page navigation (prev/next/jump)
 *   - Zoom controls (in/out/reset/fit-width)
 *   - Floating "Inject as Context" button on text selection
 *
 * Props:
 *   - onInject: (text: string) => void — called when user clicks inject button
 *   - style: CSS style object
 */
export function PdfViewer({ onInject, style = {} }) {
  const { pdfFile, pdfText, pdfParsing, pdfPages } = usePdfStore();

  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [pageLoading, setPageLoading] = useState(false);
  const [selection, setSelection] = useState(null); // { text, x, y }

  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  // Load PDF document when pdfFile changes
  useEffect(() => {
    if (!pdfFile) {
      setPdfDoc(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: copyPdfData(pdfFile) }).promise;
        if (!cancelled) {
          setPdfDoc(pdf);
          setCurrentPage(1);
          setZoom(1.0);
        }
      } catch (err) {
        console.error('[PdfViewer] Failed to load PDF:', err);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [pdfFile]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let cancelled = false;
    const render = async () => {
      setPageLoading(true);
      try {
        const page = await pdfDoc.getPage(currentPage);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const container = containerRef.current;
        const containerWidth = container ? container.clientWidth - 32 : 800;

        // Calculate scale
        let scale = zoom;
        if (zoom === 'fit-width') {
          const viewportUnscaled = page.getViewport({ scale: 1 });
          scale = containerWidth / viewportUnscaled.width;
        }

        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // Cancel previous render
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        renderTaskRef.current = null;

        if (cancelled) return;

        // Build text layer
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;

          const textContent = await page.getTextContent();
          const textItems = textContent.items;

          textItems.forEach((item) => {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[0], tx[1]);
            const fontWidth = Math.hypot(tx[2], tx[3]);

            const el = document.createElement('span');
            el.textContent = item.str;
            el.style.position = 'absolute';
            el.style.left = `${tx[4]}px`;
            el.style.top = `${tx[5] - fontHeight}px`;
            el.style.fontSize = `${fontHeight}px`;
            el.style.fontFamily = item.fontName || 'sans-serif';
            el.style.transform = `scaleX(${fontWidth ? item.width / fontWidth : 1})`;
            el.style.transformOrigin = '0 0';
            el.style.whiteSpace = 'pre';
            el.style.userSelect = 'text';
            el.style.cursor = 'text';
            el.style.color = 'transparent';
            textLayerDiv.appendChild(el);
          });
        }
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('[PdfViewer] Render error:', err);
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    };

    render();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, currentPage, zoom]);

  // Listen for text selection to show floating inject button
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (text && textLayerRef.current && textLayerRef.current.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        setSelection({
          text,
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top - 40,
        });
      } else {
        setSelection(null);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const goToPage = useCallback(
    (page) => {
      if (!pdfDoc) return;
      const target = Math.max(1, Math.min(page, pdfDoc.numPages));
      setCurrentPage(target);
      setSelection(null);
    },
    [pdfDoc]
  );

  const goPrev = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
  const goNext = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);

  const zoomIn = useCallback(() => {
    setZoom((z) => (z === 'fit-width' ? 1.25 : Math.min(MAX_ZOOM, z + ZOOM_STEP)));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => (z === 'fit-width' ? 0.75 : Math.max(MIN_ZOOM, z - ZOOM_STEP)));
  }, []);

  const zoomReset = useCallback(() => setZoom(1.0), []);
  const zoomFitWidth = useCallback(() => setZoom('fit-width'), []);

  const handleInject = useCallback(() => {
    if (selection && onInject) {
      onInject(selection.text);
      setSelection(null);
      window.getSelection().removeAllRanges();
    }
  }, [selection, onInject]);

  const { visible: progressVisible, status: progressStatus, dismiss } = useProgressStore();

  // PDF 解析完成后自动关闭进度面板
  useEffect(() => {
    if (pdfText && progressVisible && progressStatus === 'succeeded') {
      const timer = setTimeout(() => dismiss(), 800);
      return () => clearTimeout(timer);
    }
  }, [pdfText, progressVisible, progressStatus, dismiss]);

  if (pdfParsing || (progressVisible && progressStatus === 'running')) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative', ...style }}>
        <AgentProgressPanel />
      </div>
    );
  }

  if (!pdfText || !pdfFile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', ...style }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ color: 'var(--fill-tertiary)', fontSize: 13 }}>
              {t('ai-chat-no-pdf-context')}
            </span>
          }
        />
      </div>
    );
  }

  const totalPages = pdfDoc ? pdfDoc.numPages : pdfPages;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--material-sidepane, #f5f5f5)',
        position: 'relative',
        ...style,
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--fill-quinary, #e0e0e0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--material-background, #fff)',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FilePdfOutlined style={{ color: 'var(--accent-blue, #1890ff)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>PDF</span>
        </div>

        {/* Page navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button size="small" icon={<LeftOutlined />} onClick={goPrev} disabled={currentPage <= 1} />
          <Input
            size="small"
            value={currentPage}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) goToPage(val);
            }}
            style={{ width: 50, textAlign: 'center' }}
          />
          <span style={{ fontSize: 13, color: 'var(--fill-tertiary)' }}>/ {totalPages}</span>
          <Button size="small" icon={<RightOutlined />} onClick={goNext} disabled={currentPage >= totalPages} />
        </div>

        {/* Zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title="Zoom out">
            <Button size="small" icon={<ZoomOutOutlined />} onClick={zoomOut} />
          </Tooltip>
          <Tooltip title="Reset zoom">
            <Button size="small" onClick={zoomReset} style={{ fontSize: 12, minWidth: 48 }}>
              {zoom === 'fit-width' ? 'Fit' : `${Math.round((zoom || 1) * 100)}%`}
            </Button>
          </Tooltip>
          <Tooltip title="Zoom in">
            <Button size="small" icon={<ZoomInOutlined />} onClick={zoomIn} />
          </Tooltip>
          <Tooltip title="Fit width">
            <Button size="small" icon={<ColumnWidthOutlined />} onClick={zoomFitWidth} />
          </Tooltip>
        </div>
      </div>

      {/* Page canvas area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          display: 'flex',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div style={{ position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          <canvas ref={canvasRef} style={{ display: 'block', background: '#fff' }} />
          <div
            ref={textLayerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'auto',
              userSelect: 'text',
            }}
          />
          {pageLoading && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.7)',
              }}
            >
              <Spin size="small" />
            </div>
          )}
        </div>

        {/* Floating inject button */}
        {selection && (
          <div
            style={{
              position: 'absolute',
              left: Math.max(8, Math.min(selection.x, (containerRef.current?.clientWidth || 400) - 140)),
              top: Math.max(8, selection.y),
              zIndex: 100,
              background: '#fff',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: '#666',
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selection.text.slice(0, 30)}...
            </span>
            <Button
              type="primary"
              size="small"
              icon={<MessageOutlined />}
              onClick={handleInject}
            >
              {t('ai-chat-ask-about', null, 'Inject')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PdfViewer;
