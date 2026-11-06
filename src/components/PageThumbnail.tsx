import { useEffect, useRef, useState } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import type { EditorPage, SourceDocument } from '../types';

interface Props {
  page: EditorPage;
  source: SourceDocument;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (targetIndex: number) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

export default function PageThumbnail({ page, source, index, selected, onSelect, onMove, onDragStart, onDragEnd }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let task: RenderTask | undefined;
    async function render() {
      const target = canvasRef.current;
      if (!target) return;
      const pdfPage = await source.pdf.getPage(page.sourceIndex + 1);
      if (disposed) return;
      const initial = pdfPage.getViewport({ scale: 1, rotation: (pdfPage.rotate + page.rotation) % 360 });
      const width = 124;
      const scale = width / initial.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: scale * dpr, rotation: (pdfPage.rotate + page.rotation) % 360 });
      target.width = Math.round(viewport.width);
      target.height = Math.round(viewport.height);
      target.style.width = `${width}px`;
      target.style.height = `${viewport.height / dpr}px`;
      const context = target.getContext('2d');
      if (!context) return;
      task = pdfPage.render({ canvas: target, canvasContext: context, viewport });
      await task.promise;
    }
    void render().catch(() => { /* Main preview reports render failures. */ });
    return () => { disposed = true; task?.cancel(); };
  }, [page.sourceIndex, page.rotation, source, visible]);

  return (
    <div ref={rootRef} className={`thumb-row ${selected ? 'thumb-selected' : ''}`}
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-paperplane-page', page.id); onDragStart(page.id); }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-paperplane-page')) event.preventDefault(); }}
      onDrop={(event) => { if (event.dataTransfer.types.includes('application/x-paperplane-page')) { event.preventDefault(); event.stopPropagation(); onMove(index); } }}
    >
      <button className="thumb-button" type="button" onClick={onSelect}
        aria-label={`Open page ${index + 1} from ${source.name}`} aria-current={selected ? 'page' : undefined}>
        <div className="thumb-canvas-wrap"><canvas ref={canvasRef} /></div>
        <div className="thumb-meta"><span className="thumb-number">{index + 1}</span><span title={source.name} className="thumb-source">{source.name}</span></div>
      </button>
      <span className="thumb-grip" aria-hidden="true">⋮⋮</span>
    </div>
  );
}
