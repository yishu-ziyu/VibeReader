import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Empty, Spin, Tooltip, Input, message as antMessage } from 'antd';
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  ColumnWidthOutlined,
  LeftOutlined,
  RightOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';
import { usePdfStore } from './store';
import { useProgressStore } from './store/progressStore';
import { AgentProgressPanel } from './AgentProgressPanel';
import { PdfAnnotationToolbar } from './PdfAnnotationToolbar';
import { createAnnotation, listAnnotationsForDocument } from './services/annotationService';
import { flattenPdfOutline, resolveOutlinePageNumber } from './pdfOutline';
import { configurePdfWorker } from './pdfWorker';
import { isInsidePdfAnnotationToolbar } from './pdfSelection';
import { t } from './i18n';
import { createDragInjectPayload, writeDragInjectData } from './dragInject';
import { extractParagraphsFromPage } from './paragraphExtractor';

configurePdfWorker(pdfjsLib);

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.25;

function copyPdfData(data) {
  if (data instanceof Uint8Array) return data.slice();
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  return data;
}

function getParagraphPage(paragraphId) {
  const match = String(paragraphId || '').match(/^page-(\d+)-para-\d+$/);
  return match ? Number(match[1]) : null;
}

function getTextItemY(item) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return Number(transform[5]) || 0;
}

function findParagraphIdForItem(item, paragraphs) {
  if (!paragraphs.length) return null;
  const y = getTextItemY(item);
  const sorted = [...paragraphs].sort((a, b) => b.y - a.y);
  if (y >= sorted[0].y) return sorted[0].id;

  for (let index = 0; index < sorted.length; index += 1) {
    const next = sorted[index + 1];
    if (y <= sorted[index].y && (!next || y > next.y)) return sorted[index].id;
  }
  return sorted[sorted.length - 1].id;
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
 *   - documentId: string — used for annotation persistence
 *   - style: CSS style object
 */
export function PdfViewer({ onInject, documentId = 'current-pdf', style = {} }) {
  const { pdfFile, pdfText, pdfParsing, pdfPages } = usePdfStore();

  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [pageLoading, setPageLoading] = useState(false);
  const [selection, setSelection] = useState(null); // { text, x, y, rect }
  const [outlineItems, setOutlineItems] = useState([]);
  const [annotations, setAnnotations] = useState([]);

  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const highlightLayerRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const pendingParagraphIdRef = useRef(null);

  const highlightParagraph = useCallback((paragraphId) => {
    const textLayer = textLayerRef.current;
    if (!paragraphId || !textLayer) return false;
    const spans = textLayer.querySelectorAll(`[data-paragraph-id="${paragraphId}"]`);
    if (spans.length === 0) return false;

    spans[0].scrollIntoView({ block: 'center', inline: 'nearest' });
    spans.forEach((span) => span.classList.add('paragraph-pulse-highlight'));
    window.setTimeout(() => {
      spans.forEach((span) => span.classList.remove('paragraph-pulse-highlight'));
    }, 3000);
    return true;
  }, []);

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

  useEffect(() => {
    if (!pdfDoc) {
      setOutlineItems([]);
      return;
    }

    let cancelled = false;
    const loadOutline = async () => {
      try {
        const outline = await pdfDoc.getOutline();
        if (!cancelled) setOutlineItems(flattenPdfOutline(outline || []));
      } catch (error) {
        console.warn('[PdfViewer] Failed to load outline:', error);
        if (!cancelled) setOutlineItems([]);
      }
    };
    loadOutline();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  // Reset visual/page states immediately when documentId changes to isolate documents completely
  useEffect(() => {
    setPdfDoc(null);
    setCurrentPage(1);
    setZoom(1.0);
    setSelection(null);
    setOutlineItems([]);
    setAnnotations([]);
  }, [documentId]);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    listAnnotationsForDocument(documentId).then((items) => {
      if (!cancelled) setAnnotations(items);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

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
          const paragraphs = extractParagraphsFromPage(textContent, currentPage);

          textItems.forEach((item) => {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[0], tx[1]);
            const fontWidth = Math.hypot(tx[2], tx[3]);
            const paragraphId = findParagraphIdForItem(item, paragraphs);

            const el = document.createElement('span');
            el.textContent = item.str;
            if (paragraphId) {
              el.setAttribute('data-paragraph-id', paragraphId);
            }
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

          const pendingParagraphId = pendingParagraphIdRef.current;
          if (getParagraphPage(pendingParagraphId) === currentPage) {
            window.setTimeout(() => {
              if (highlightParagraph(pendingParagraphId)) pendingParagraphIdRef.current = null;
            }, 0);
          }
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
  }, [pdfDoc, currentPage, zoom, highlightParagraph]);

  // Render annotation highlights on the current page
  useEffect(() => {
    if (!highlightLayerRef.current || !textLayerRef.current) return;

    const layer = highlightLayerRef.current;
    layer.innerHTML = '';

    const pageAnnotations = annotations.filter((a) => a.page === currentPage && a.rect);
    if (pageAnnotations.length === 0) return;

    const { width, height } = textLayerRef.current.getBoundingClientRect();
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;

    pageAnnotations.forEach((annotation) => {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = `${annotation.rect.left}px`;
      el.style.top = `${annotation.rect.top}px`;
      el.style.width = `${annotation.rect.width}px`;
      el.style.height = `${annotation.rect.height}px`;
      el.style.backgroundColor =
        annotation.color === 'yellow' ? 'rgba(255, 235, 59, 0.4)' : 'rgba(33, 150, 243, 0.3)';
      el.style.borderRadius = '2px';
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.title = annotation.note || annotation.selectedText;
      el.addEventListener('click', () => {
        antMessage.info(annotation.note || annotation.selectedText);
      });
      layer.appendChild(el);
    });
  }, [annotations, currentPage]);

  // Listen for text selection to show floating inject button
  useEffect(() => {
    const handleSelectionChange = () => {
      if (isInsidePdfAnnotationToolbar(document.activeElement)) {
        return;
      }

      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (text && textLayerRef.current && textLayerRef.current.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const textLayerRect = textLayerRef.current.getBoundingClientRect();
        setSelection({
          text,
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top - 40,
          rect: {
            left: rect.left - textLayerRect.left,
            top: rect.top - textLayerRect.top,
            width: rect.width,
            height: rect.height,
          },
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

  useEffect(() => {
    const handleNavigateParagraph = (event) => {
      const paragraphId = event.detail?.paragraphId;
      const page = getParagraphPage(paragraphId);
      if (!paragraphId || !page) return;

      pendingParagraphIdRef.current = paragraphId;
      if (page !== currentPage) {
        goToPage(page);
      } else {
        window.setTimeout(() => {
          if (highlightParagraph(paragraphId)) pendingParagraphIdRef.current = null;
        }, 0);
      }
    };

    window.addEventListener('vibereader:navigate-paragraph', handleNavigateParagraph);
    return () => window.removeEventListener('vibereader:navigate-paragraph', handleNavigateParagraph);
  }, [currentPage, goToPage, highlightParagraph]);

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

  const handleSelectionDragStart = useCallback((event) => {
    const payload = createDragInjectPayload({
      text: selection?.text,
      page: currentPage,
      source: 'pdf-selection',
    });
    if (!payload) return;
    writeDragInjectData(event.dataTransfer, payload);
  }, [currentPage, selection]);

  const handleAnnotationDragStart = useCallback((event, annotation) => {
    const payload = createDragInjectPayload({
      text: annotation?.selectedText,
      page: annotation?.page,
      source: 'pdf-annotation',
    });
    if (!payload) return;
    writeDragInjectData(event.dataTransfer, payload);
  }, []);

  const handleHighlight = useCallback(async (selectedText) => {
    if (!selectedText || !documentId) return;
    const annotation = await createAnnotation({
      documentId,
      page: currentPage,
      selectedText,
      color: 'yellow',
      rect: selection?.rect || null,
    });
    setAnnotations((items) => [annotation, ...items]);
    setSelection(null);
    window.getSelection().removeAllRanges();
    antMessage.success('已保存高亮');
  }, [currentPage, documentId, selection]);

  const handleSaveNote = useCallback(async (selectedText, note) => {
    if (!selectedText || !note || !documentId) return;
    const annotation = await createAnnotation({
      documentId,
      page: currentPage,
      selectedText,
      note,
      color: 'blue',
      rect: selection?.rect || null,
    });
    setAnnotations((items) => [annotation, ...items]);
    setSelection(null);
    window.getSelection().removeAllRanges();
    antMessage.success('已保存笔记');
  }, [currentPage, documentId, selection]);

  const handleOutlineClick = useCallback(async (outlineItem) => {
    const pageNumber = await resolveOutlinePageNumber(pdfDoc, outlineItem);
    if (pageNumber) {
      goToPage(pageNumber);
    } else {
      antMessage.warning('暂时无法跳转该目录项');
    }
  }, [goToPage, pdfDoc]);

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

      {outlineItems.length > 0 && (
        <div className="pdf-outline-strip" aria-label="PDF 大纲">
          {outlineItems.map((item) => (
            <Button
              key={item.id}
              type="text"
              size="small"
              className="pdf-outline-item"
              style={{ paddingLeft: 8 + item.level * 14 }}
              onClick={() => handleOutlineClick(item)}
            >
              {item.title}
            </Button>
          ))}
        </div>
      )}

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
            draggable={!!selection}
            onDragStart={handleSelectionDragStart}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'auto',
              userSelect: 'text',
            }}
          />
          <div
            ref={highlightLayerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
              zIndex: 1,
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

        <PdfAnnotationToolbar
          selection={selection && {
            ...selection,
            x: Math.max(8, Math.min(selection.x, (containerRef.current?.clientWidth || 400) - 420)),
            y: Math.max(8, selection.y),
          }}
          onInject={() => handleInject()}
          onHighlight={handleHighlight}
          onSaveNote={handleSaveNote}
        />
      </div>

      {annotations.length > 0 && (
        <div className="pdf-annotation-list" aria-label="PDF 批注列表">
          {annotations.slice(0, 5).map((annotation) => (
            <div
              key={annotation.id}
              className="pdf-annotation-list-item"
              draggable
              onDragStart={(event) => handleAnnotationDragStart(event, annotation)}
            >
              <span className={`pdf-annotation-color pdf-annotation-color-${annotation.color}`} />
              <span className="pdf-annotation-page">P{annotation.page}</span>
              <span className="pdf-annotation-text">{annotation.selectedText}</span>
              {annotation.note && <span className="pdf-annotation-note">｜{annotation.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PdfViewer;
