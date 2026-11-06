import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { EditorPage, HighlightQuad, SourceDocument, TextStamp, ToolMode } from '../types';
import { selectionRectToQuad } from '../pdf/geometry';

type Viewport = ReturnType<PDFPageProxy['getViewport']>;

export interface PdfViewportHandle {
  captureSelection: () => HighlightQuad[];
}

interface Props {
  item: EditorPage;
  source: SourceDocument;
  zoom: number;
  tool: ToolMode;
  selectedStampId: string | null;
  onAddText: (x: number, y: number) => void;
  onSelectStamp: (id: string | null) => void;
  onMoveStamp: (id: string, x: number, y: number) => void;
}

function OverlayStamp({ stamp, viewport, zoom, selected, onSelect, onMove }: {
  stamp: TextStamp;
  viewport: Viewport;
  zoom: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const position = viewport.convertToViewportPoint(stamp.x, stamp.y);
  const textRef = useRef<HTMLDivElement>(null);

  function drag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(stamp.id);
    const node = textRef.current;
    if (!node) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startingLeft = position[0];
    const startingTop = position[1] - stamp.size * zoom;
    let finalDx = 0;
    let finalDy = 0;

    const onPointerMove = (move: globalThis.PointerEvent) => {
      finalDx = move.clientX - startX;
      finalDy = move.clientY - startY;
      node.style.left = `${startingLeft + finalDx}px`;
      node.style.top = `${startingTop + finalDy}px`;
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const [x, y] = viewport.convertToPdfPoint(position[0] + finalDx, position[1] + finalDy);
      onMove(stamp.id, Number(x.toFixed(2)), Number(y.toFixed(2)));
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  return (
    <div
      ref={textRef}
      className={`stamp ${selected ? 'stamp-selected' : ''}`}
      style={{
        left: position[0], top: position[1] - stamp.size * zoom,
        maxWidth: stamp.width * zoom, minWidth: 36,
        fontSize: stamp.size * zoom, color: stamp.color,
        fontFamily: stamp.font === 'Courier' ? 'monospace' : 'Arial, Helvetica, sans-serif',
        fontWeight: stamp.font === 'HelveticaBold' ? 700 : 400,
      }}
      onPointerDown={drag}
      onClick={(event) => event.stopPropagation()}
      title="Drag to move · edit text in the properties panel"
      role="button"
      tabIndex={0}
      aria-label={`Move text box: ${stamp.text.slice(0, 40)}`}
      onKeyDown={(event) => { if (event.key === 'Enter') onSelect(stamp.id); }}
    >
      {stamp.text || 'New text'}
    </div>
  );
}

const PdfViewport = forwardRef<PdfViewportHandle, Props>(function PdfViewport({
  item, source, zoom, tool, selectedStampId, onAddText, onSelectStamp, onMoveStamp,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    setError(null);
    setViewport(null);
    const canvas = canvasRef.current;
    const layer = textLayerRef.current;
    if (!canvas || !layer) return;
    layer.replaceChildren();

    async function render() {
      const page = await source.pdf.getPage(item.sourceIndex + 1);
      if (disposed) return;
      const rotation = (page.rotate + item.rotation) % 360;
      const display = page.getViewport({ scale: zoom, rotation });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixels = page.getViewport({ scale: zoom * dpr, rotation });
      viewportRef.current = display;
      setViewport(display);
      canvas!.width = Math.round(pixels.width);
      canvas!.height = Math.round(pixels.height);
      canvas!.style.width = `${display.width}px`;
      canvas!.style.height = `${display.height}px`;
      layer!.style.width = `${display.width}px`;
      layer!.style.height = `${display.height}px`;
      layer!.style.setProperty('--scale-factor', String(display.scale));
      const context = canvas!.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
      renderTask = page.render({ canvas: canvas!, canvasContext: context, viewport: pixels });
      await renderTask.promise;
      if (disposed) return;
      const content = await page.getTextContent();
      if (disposed) return;
      textLayer = new TextLayer({ textContentSource: content, container: layer!, viewport: display });
      await textLayer.render();
    }
    void render().catch((cause: unknown) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : 'Unable to render the page.');
    });
    return () => {
      disposed = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [source, item.sourceIndex, item.rotation, zoom]);

  useImperativeHandle(ref, () => ({
    captureSelection() {
      const selection = window.getSelection();
      const layer = textLayerRef.current;
      const currentViewport = viewportRef.current;
      if (!selection || !selection.rangeCount || !layer || !currentViewport || selection.isCollapsed) return [];
      const range = selection.getRangeAt(0);
      if (!layer.contains(range.commonAncestorContainer)) return [];
      const pageRect = layer.getBoundingClientRect();
      const quads: HighlightQuad[] = [];
      for (const rect of Array.from(range.getClientRects())) {
        const quad = selectionRectToQuad(rect, pageRect, currentViewport);
        if (quad) quads.push(quad);
      }
      return quads;
    },
  }), []);

  function pageClick(event: MouseEvent<HTMLDivElement>) {
    if (tool !== 'text' || !viewportRef.current || !surfaceRef.current) {
      if (tool === 'select') onSelectStamp(null);
      return;
    }
    const rect = surfaceRef.current.getBoundingClientRect();
    const [x, y] = viewportRef.current.convertToPdfPoint(
      event.clientX - rect.left, event.clientY - rect.top,
    );
    onAddText(Math.round(x), Math.round(y));
  }

  return (
    <div className="paper-shell">
      <div
        className={`paper-surface ${tool === 'text' ? 'tool-text' : ''}`}
        ref={surfaceRef}
        style={{ width: viewport?.width ?? 612 * zoom, height: viewport?.height ?? 792 * zoom }}
        onClick={pageClick}
      >
        <canvas ref={canvasRef} className="paper-canvas" aria-label="Rendered PDF page" />
        <div ref={textLayerRef} className={`textLayer pdf-text-layer ${tool === 'text' ? 'text-layer-passive' : ''}`} />
        {viewport && item.highlights.flatMap((highlight) => highlight.quads.map((quad, index) => {
          const rect = viewport.convertToViewportRectangle([quad.left, quad.bottom, quad.right, quad.top]);
          return (
            <div key={`${highlight.id}-${index}`} className="highlight-overlay" style={{
              left: Math.min(rect[0], rect[2]), top: Math.min(rect[1], rect[3]),
              width: Math.abs(rect[2] - rect[0]), height: Math.abs(rect[3] - rect[1]),
              background: highlight.color,
            }} />
          );
        }))}
        {viewport && item.stamps.map((stamp) => (
          <OverlayStamp
            key={stamp.id} stamp={stamp} viewport={viewport} zoom={zoom}
            selected={selectedStampId === stamp.id}
            onSelect={onSelectStamp}
            onMove={(id, x, y) => onMoveStamp(id, x, y)}
          />
        ))}
        {!viewport && !error && <div className="page-loading">Rendering page…</div>}
        {error && <div className="page-error" role="alert">{error}</div>}
      </div>
    </div>
  );
});

export default PdfViewport;
