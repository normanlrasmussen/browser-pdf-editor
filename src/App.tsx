import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, Copy, Download,
  FilePlus2, FileText, Files, Grip, Highlighter, Info, Layers3, LoaderCircle,
  MousePointer2, RotateCcw, RotateCw, ShieldCheck, Trash2, Type, Undo2, Redo2,
  UploadCloud, X, ZoomIn, ZoomOut, SlidersHorizontal,
} from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { EditorPage, SourceDocument, TextStamp, ToolMode } from './types';
import { makeId } from './types';
import { historyReducer, initialHistory } from './editor/history';
import { openPdf } from './pdf/load';
import { downloadPdf, exportPages, parsePageRange } from './pdf/export';
import PdfViewport from './components/PdfViewport';
import type { PdfViewportHandle } from './components/PdfViewport';
import PageThumbnail from './components/PageThumbnail';
import { calculateFitZoom, nextZoomStep, ZOOM_PRESETS } from './pdf/zoom';
import type { ZoomMode } from './pdf/zoom';

type ExportMode = 'all' | 'current' | 'range';

const MAX_TOTAL_PAGES = 600;

function pagesFromSource(source: SourceDocument): EditorPage[] {
  return Array.from({ length: source.pageCount }, (_, index) => ({
    id: makeId(), sourceId: source.id, sourceIndex: index,
    rotation: 0, stamps: [], highlights: [],
  }));
}

function descriptiveError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createDemoFile(): Promise<File> {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const heading = await doc.embedFont(StandardFonts.HelveticaBold);
  const titles = ['A private workspace', 'Arrange your pages', 'Make it yours'];
  const copy = [
    ['Your PDF stays on your device.', 'No uploads, no user accounts, no tracking.', 'Try selecting this text to highlight it.'],
    ['Import multiple PDFs to combine them.', 'Drag thumbnails to reorder the pages.', 'Duplicate, rotate and remove pages.'],
    ['Click Add text, then choose a location.', 'Edit the text in the Properties sidebar.', 'Export a standard PDF when finished.'],
  ];
  titles.forEach((title, index) => {
    const page = doc.addPage(index === 1 ? [595, 842] : [612, 792]);
    const { height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 12, width: page.getWidth(), height: 12, color: rgb(0.24, 0.34, 0.9) });
    page.drawText('PAPERPLANE / DEMO', { x: 55, y: height - 70, font: heading, size: 12, color: rgb(0.36, 0.39, 0.46) });
    page.drawText(title, { x: 55, y: height - 150, font: heading, size: 29, color: rgb(0.1, 0.15, 0.25) });
    copy[index].forEach((line, i) => page.drawText(line, {
      x: 55, y: height - 215 - i * 37, font: body, size: 14, color: rgb(0.22, 0.29, 0.39),
    }));
    page.drawText(`${index + 1} / 3`, { x: 55, y: 50, font: body, size: 11, color: rgb(0.47, 0.52, 0.61) });
  });
  const bytes = await doc.save();
  return new File([new Uint8Array(bytes)], 'paperplane-demo.pdf', { type: 'application/pdf' });
}

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const pages = history.present;
  const [sources, setSources] = useState<Record<string, SourceDocument>>({});
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolMode>('select');
  const [highlightColor, setHighlightColor] = useState('#ffe066');
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-page');
  const [manualZoom, setManualZoom] = useState(1);
  const [pageDimensions, setPageDimensions] = useState<{ key: string; width: number; height: number } | null>(null);
  const [fitAreaDimensions, setFitAreaDimensions] = useState({ width: 0, height: 0 });
  const [exportMode, setExportMode] = useState<ExportMode>('all');
  const [pageRange, setPageRange] = useState('1-3');
  const [busy, setBusy] = useState<'opening' | 'exporting' | null>(null);
  const [notice, setNotice] = useState<{ message: string; isError: boolean } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useRef<PdfViewportHandle>(null);
  const fitAreaRef = useRef<HTMLDivElement>(null);
  const draggingPageId = useRef<string | null>(null);

  const activePage = useMemo(() => pages.find((p) => p.id === selectedPageId) ?? pages[0] ?? null, [pages, selectedPageId]);
  const activeIndex = activePage ? pages.findIndex((p) => p.id === activePage.id) : -1;
  const activeSource = activePage ? sources[activePage.sourceId] : undefined;
  const activeStamp = activePage?.stamps.find((s) => s.id === selectedStampId);
  const sourceList = useMemo(() => Object.values(sources), [sources]);
  const activePageGeometryKey = activePage ? `${activePage.sourceId}:${activePage.sourceIndex}:${activePage.rotation}` : null;
  const zoom = zoomMode === 'custom' ? manualZoom
    : pageDimensions?.key === activePageGeometryKey && fitAreaDimensions.width > 0 && fitAreaDimensions.height > 0
      ? calculateFitZoom(pageDimensions, fitAreaDimensions, zoomMode)
      : 0.8;

  // PDF dimensions are measured in page points at scale 1, including the active rotation.
  // Delayed responses cannot apply dimensions from a previously selected page.
  useEffect(() => {
    let cancelled = false;
    if (!activePage || !activeSource || !activePageGeometryKey) {
      return;
    }
    const pageIndex = activePage.sourceIndex;
    const userRotation = activePage.rotation;
    const key = activePageGeometryKey;
    void activeSource.pdf.getPage(pageIndex + 1).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + userRotation) % 360 });
      setPageDimensions({ key, width: viewport.width, height: viewport.height });
    }).catch(() => {
      // The PDF viewport reports unsupported or damaged pages to the user.
    });
    return () => { cancelled = true; };
  }, [activePageGeometryKey, activeSource]);

  // A ResizeObserver handles window size changes, sidebar changes, and workspace resizing.
  useEffect(() => {
    const area = fitAreaRef.current;
    if (!area) return;
    const measure = () => {
      const width = area.clientWidth;
      const height = area.clientHeight;
      setFitAreaDimensions((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [activePage?.id]);

  function setZoomPreset(value: string) {
    if (value === 'fit-page' || value === 'fit-width') {
      setZoomMode(value);
      return;
    }
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    setManualZoom(next);
    setZoomMode('custom');
  }

  function changeZoom(direction: -1 | 1) {
    setManualZoom(nextZoomStep(zoom, direction));
    setZoomMode('custom');
  }

  const showNotice = useCallback((message: string, isError = false) => setNotice({ message, isError }), []);

  async function importFiles(files: File[]) {
    if (!files.length || busy) return;
    setBusy('opening');
    const failed: string[] = [];
    let pageCapacity = pages.length;
    let firstNewPageId: string | null = null;
    try {
      for (const file of files) {
        let source: SourceDocument | undefined;
        try {
          source = await openPdf(file);
          if (pageCapacity + source.pageCount > MAX_TOTAL_PAGES) {
            await source.pdf.destroy();
            failed.push(`${file.name}: maximum ${MAX_TOTAL_PAGES} workspace pages exceeded.`);
            continue;
          }
          const incoming = pagesFromSource(source);
          setSources((current) => ({ ...current, [source!.id]: source! }));
          dispatch({ type: 'append', pages: incoming });
          if (!firstNewPageId) firstNewPageId = incoming[0].id;
          pageCapacity += incoming.length;
        } catch (error) {
          failed.push(descriptiveError(error));
        }
      }
      if (firstNewPageId) {
        setSelectedPageId(firstNewPageId);
        setSelectedStampId(null);
        setTool('select');
      }
      if (failed.length) showNotice(failed.join(' · '), true);
      else if (firstNewPageId) showNotice('PDF loaded locally. No files were uploaded.');
    } finally {
      setBusy(null);
    }
  }

  function pickFiles() { fileInput.current?.click(); }
  function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    void importFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }
  function dropFiles(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    void importFiles(Array.from(event.dataTransfer.files));
  }

  function addText(x: number, y: number) {
    if (!activePage) return;
    const stamp: TextStamp = {
      id: makeId(), text: 'Your text', x, y, width: 210,
      size: 16, color: '#182338', font: 'Helvetica',
    };
    dispatch({ type: 'addStamp', pageId: activePage.id, stamp });
    setSelectedStampId(stamp.id);
    setTool('select');
    showNotice('Text box added. Edit it in the Properties panel.');
  }

  function highlightSelection() {
    if (!activePage) return;
    const quads = preview.current?.captureSelection() ?? [];
    if (!quads.length) {
      showNotice('Select some existing page text with your mouse, then click Highlight selection.', true);
      return;
    }
    dispatch({ type: 'addHighlight', pageId: activePage.id,
      highlight: { id: makeId(), color: highlightColor, quads },
    });
    window.getSelection()?.removeAllRanges();
    showNotice('Highlight added. It will be exported as a PDF annotation.');
  }

  function deletePage() {
    if (!activePage) return;
    const next = pages[activeIndex + 1] ?? pages[activeIndex - 1] ?? null;
    dispatch({ type: 'delete', pageId: activePage.id });
    setSelectedPageId(next?.id ?? null);
    setSelectedStampId(null);
  }

  async function savePdf() {
    if (!pages.length || busy) return;
    let chosen: EditorPage[];
    try {
      if (exportMode === 'current') chosen = activePage ? [activePage] : [];
      else if (exportMode === 'range') chosen = parsePageRange(pageRange, pages.length).map((i) => pages[i]);
      else chosen = pages;
      setBusy('exporting');
      const result = await exportPages(chosen, sources);
      downloadPdf(result, exportMode === 'all' ? 'paperplane-edited.pdf' : 'paperplane-selection.pdf');
      showNotice(`Exported ${chosen.length} page${chosen.length === 1 ? '' : 's'} locally.`);
    } catch (error) {
      showNotice(`Export failed: ${descriptiveError(error)}`, true);
    } finally {
      setBusy(null);
    }
  }

  function movePage(targetIndex: number) {
    const moving = draggingPageId.current;
    if (moving) dispatch({ type: 'move', pageId: moving, to: targetIndex });
    draggingPageId.current = null;
  }

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault(); dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  return (
    <div className="app-root">
      <input ref={fileInput} type="file" accept=".pdf,application/pdf" multiple hidden onChange={fileChanged} />
      <header className="app-header">
        <div className="brand"><span className="brand-mark"><Layers3 size={20} strokeWidth={2.3} /></span>
          <div><strong>paperplane</strong><span className="brand-subtitle">PDF STUDIO</span></div>
        </div>
        <div className="header-middle"><span className="header-pill"><span className="online-dot" /> Local workspace</span>
          <span className="header-divider" /><span className="document-counter">{pages.length ? `${pages.length} pages · ${sourceList.length} files` : 'No document open'}</span>
        </div>
        <div className="header-actions">
          <span className="private-note"><ShieldCheck size={15} /> Private by design</span>
          <button type="button" className="icon-button mobile-properties-toggle" title="Toggle properties" aria-label="Toggle properties" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen((open) => !open)}><SlidersHorizontal size={20} /></button>
          <button type="button" className="button button-secondary" onClick={pickFiles} disabled={!!busy}><FilePlus2 size={17} /> Add PDFs</button>
          <button type="button" className="button button-primary" onClick={() => void savePdf()} disabled={!pages.length || !!busy}>
            {busy === 'exporting' ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />} Export PDF
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-sidebar">
          <div className="sidebar-heading"><div><span className="eyebrow">DOCUMENT</span><h2>Pages <span className="count-badge">{pages.length}</span></h2></div>
            <button type="button" className="icon-button" onClick={pickFiles} title="Add PDFs" aria-label="Add PDF documents"><FilePlus2 size={19} /></button>
          </div>
          <div className="page-list">
            {pages.length ? pages.map((page, index) => sources[page.sourceId] && (
              <PageThumbnail key={page.id} page={page} source={sources[page.sourceId]} index={index}
                selected={page.id === activePage?.id} onSelect={() => { setSelectedPageId(page.id); setSelectedStampId(null); }}
                onDragStart={(id) => { draggingPageId.current = id; }} onDragEnd={() => { draggingPageId.current = null; }}
                onMove={movePage} />
            )) : (
              <div className="empty-thumbs"><Files size={26} /><p>Imported pages appear here.</p></div>
            )}
          </div>
          <div className="sidebar-bottom">
            <div className="small-heading">SOURCE FILES</div>
            {sourceList.length ? <div className="source-list">{sourceList.map((s) => (
              <div className="source-file" key={s.id}><FileText size={15} /><span title={s.name}>{s.name}</span><small>{s.pageCount}</small></div>
            ))}</div> : <p className="muted-note">Nothing imported yet</p>}
            <button type="button" className="text-button" onClick={pickFiles}><FilePlus2 size={15} /> Add another document</button>
          </div>
        </aside>

        <main className="main-content" onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={dropFiles}>
          <div className="tools-bar">
            <div className="toolset"><span className="toolset-label">TOOLS</span>
              <button type="button" className={`tool-button ${tool === 'select' ? 'active' : ''}`} title="Select" onClick={() => setTool('select')}><MousePointer2 size={17} /><span>Select</span></button>
              <button type="button" className={`tool-button ${tool === 'text' ? 'active' : ''}`} title="Place a text box" onClick={() => setTool('text')} disabled={!pages.length}><Type size={18} /><span>Add text</span></button>
              <button type="button" className={`tool-button ${tool === 'highlight' ? 'active' : ''}`} title="Highlight existing text" onClick={() => setTool('highlight')} disabled={!pages.length}><Highlighter size={18} /><span>Highlight</span></button>
              {tool === 'highlight' && <><input type="color" aria-label="Highlight color" title="Highlight color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} className="color-picker-mini" />
                <button type="button" className="button button-blue small-button" onClick={highlightSelection}>Highlight selection</button></>}
            </div>
            <div className="toolset utility-tools"><button type="button" className="icon-button" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={18} /></button>
              <button type="button" className="icon-button" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={18} /></button>
              <span className="vertical-separator" />
              <button type="button" className="icon-button" disabled={!activePage} onClick={() => activePage && dispatch({ type: 'rotate', pageId: activePage.id, direction: 'ccw' })} title="Rotate left" aria-label="Rotate left"><RotateCcw size={18} /></button>
              <button type="button" className="icon-button" disabled={!activePage} onClick={() => activePage && dispatch({ type: 'rotate', pageId: activePage.id, direction: 'cw' })} title="Rotate right" aria-label="Rotate right"><RotateCw size={18} /></button>
              <button type="button" className="icon-button" disabled={!activePage} onClick={() => activePage && (pages.length < MAX_TOTAL_PAGES ? dispatch({ type: 'duplicate', pageId: activePage.id, newPageId: makeId() }) : showNotice('Workspace page limit reached.', true))} title="Duplicate page" aria-label="Duplicate page"><Copy size={18} /></button>
              <button type="button" className="icon-button danger-hover" disabled={!activePage} onClick={deletePage} title="Remove page" aria-label="Remove page"><Trash2 size={18} /></button>
            </div>
          </div>

          {activePage && activeSource ? (
            <div className="document-stage" key="document-stage">
              <div className="stage-topline"><span><FileText size={14} /> {activeSource.name}</span><span>PAGE {activeIndex + 1} OF {pages.length}</span></div>
              <div className="document-canvas-area" ref={fitAreaRef} aria-label="PDF page workspace">
                <PdfViewport
                  ref={preview} item={activePage} source={activeSource} zoom={zoom} tool={tool}
                  selectedStampId={selectedStampId} onAddText={addText} onSelectStamp={setSelectedStampId}
                  onMoveStamp={(stampId, x, y) => dispatch({ type: 'updateStamp', pageId: activePage.id, stampId, changes: { x, y } })}
                />
              </div>
              <div className="stage-footer-note"><ShieldCheck size={15} /> Your documents never leave this browser.</div>
            </div>
          ) : (
            <div className="empty-stage">
              <div className="empty-card">
                <div className="empty-art"><div className="art-page back" /><div className="art-page front"><FileText size={44} strokeWidth={1.4} /><span /><span /><span /></div><span className="art-spark">✦</span></div>
                <span className="welcome-eyebrow">YOUR PERSONAL PDF WORKSPACE</span>
                <h1>Every PDF, handled<br /><em>beautifully.</em></h1>
                <p>Combine, arrange, annotate and export your documents. Everything happens privately, right here in your browser.</p>
                <button type="button" className="button button-primary large-button" onClick={pickFiles} disabled={!!busy}>
                  {busy === 'opening' ? <LoaderCircle size={18} className="spin" /> : <UploadCloud size={19} />} Open a PDF
                </button>
                <button type="button" className="sample-link" onClick={() => void createDemoFile().then((file) => importFiles([file])).catch((e: unknown) => showNotice(descriptiveError(e), true))} disabled={!!busy}>
                  Or explore with a sample document <ArrowRight size={15} />
                </button>
                <div className="empty-features"><span><Check size={15} /> No uploads</span><span><Check size={15} /> No account</span><span><Check size={15} /> Completely free</span></div>
              </div>
            </div>
          )}
          {activePage && (
            <div className="bottom-toolbar">
              <div className="page-switcher"><button type="button" className="icon-button" aria-label="Previous page" disabled={activeIndex <= 0} onClick={() => { setSelectedPageId(pages[activeIndex - 1].id); setSelectedStampId(null); }}><ArrowLeft size={17} /></button>
                <strong>{activeIndex + 1}</strong><span>/ {pages.length}</span>
                <button type="button" className="icon-button" aria-label="Next page" disabled={activeIndex >= pages.length - 1} onClick={() => { setSelectedPageId(pages[activeIndex + 1].id); setSelectedStampId(null); }}><ArrowRight size={17} /></button>
              </div>
              <div className="zoom-controls" aria-label="PDF zoom controls">
                <button type="button" className="icon-button" title="Zoom out" aria-label="Zoom out" disabled={zoom <= ZOOM_PRESETS[0]} onClick={() => changeZoom(-1)}><ZoomOut size={17} /></button>
                <select
                  className="zoom-select"
                  aria-label="Zoom level"
                  value={zoomMode === 'custom' ? String(manualZoom) : zoomMode}
                  onChange={(event) => setZoomPreset(event.target.value)}
                >
                  <option value="fit-page">Fit page</option>
                  <option value="fit-width">Fit width</option>
                  {ZOOM_PRESETS.map((scale) => <option key={scale} value={String(scale)}>{Math.round(scale * 100)}%</option>)}
                </select>
                <output className="zoom-percent" aria-label="Current zoom">{Math.round(zoom * 100)}%</output>
                <button type="button" className="icon-button" title="Zoom in" aria-label="Zoom in" disabled={zoom >= ZOOM_PRESETS[ZOOM_PRESETS.length - 1]} onClick={() => changeZoom(1)}><ZoomIn size={17} /></button>
              </div>
            </div>
          )}
        </main>

        <aside className={`right-sidebar ${inspectorOpen ? 'mobile-open' : ''}`}>
          <div className="sidebar-heading properties-heading"><div><span className="eyebrow">INSPECTOR</span><h2>Properties</h2></div><Grip size={17} className="muted-icon" /></div>
          <div className="properties-content">
            {activeStamp && activePage ? (
              <section className="property-section"><div className="section-heading"><Type size={17} /> Text box</div>
                <label className="form-label" htmlFor="stampText">Content</label>
                <textarea id="stampText" className="form-control text-input" rows={4} value={activeStamp.text} onChange={(e) => dispatch({ type: 'updateStamp', pageId: activePage.id, stampId: activeStamp.id, changes: { text: e.target.value } })} />
                <label className="form-label" htmlFor="stampFont">Font family</label>
                <select id="stampFont" className="form-control" value={activeStamp.font} onChange={(e) => dispatch({ type: 'updateStamp', pageId: activePage.id, stampId: activeStamp.id, changes: { font: e.target.value as TextStamp['font'] } })}>
                  <option value="Helvetica">Helvetica</option><option value="HelveticaBold">Helvetica Bold</option><option value="Courier">Courier</option>
                </select>
                <div className="two-fields"><div><label className="form-label" htmlFor="stampSize">Size (pt)</label>
                  <input id="stampSize" className="form-control" type="number" min="6" max="96" value={activeStamp.size} onChange={(e) => dispatch({ type: 'updateStamp', pageId: activePage.id, stampId: activeStamp.id, changes: { size: Math.max(6, Math.min(96, Number(e.target.value) || 6)) } })} /></div>
                  <div><label className="form-label" htmlFor="stampColor">Color</label><input id="stampColor" className="form-control color-input" type="color" value={activeStamp.color} onChange={(e) => dispatch({ type: 'updateStamp', pageId: activePage.id, stampId: activeStamp.id, changes: { color: e.target.value } })} /></div></div>
                <label className="form-label" htmlFor="stampWidth">Wrap width (pt)</label>
                <input id="stampWidth" className="form-control" type="number" min="50" max="1000" value={activeStamp.width} onChange={(e) => dispatch({ type: 'updateStamp', pageId: activePage.id, stampId: activeStamp.id, changes: { width: Math.max(50, Math.min(1000, Number(e.target.value) || 50)) } })} />
                <button className="button button-danger wide" type="button" onClick={() => { dispatch({ type: 'deleteStamp', pageId: activePage.id, stampId: activeStamp.id }); setSelectedStampId(null); }}><Trash2 size={15} /> Delete text box</button>
                <p className="helper-text">Drag a box to reposition it. Text is added as real, selectable PDF text on export.</p>
              </section>
            ) : (
              <section className="property-section"><div className="section-heading"><Layers3 size={17} /> Document details</div>
                <div className="detail-row"><span>Pages</span><strong>{pages.length}</strong></div>
                <div className="detail-row"><span>Source files</span><strong>{sourceList.length}</strong></div>
                <div className="detail-row"><span>Current page</span><strong>{activePage ? activeIndex + 1 : '—'}</strong></div>
                {activePage && <><p className="subheading">Page actions</p>
                  <button type="button" className="action-row" disabled={activeIndex <= 0} onClick={() => dispatch({ type: 'move', pageId: activePage.id, to: activeIndex - 1 })}><ArrowLeft size={16} /> Move page earlier <ArrowRight size={15} /></button>
                  <button type="button" className="action-row" disabled={activeIndex >= pages.length - 1} onClick={() => dispatch({ type: 'move', pageId: activePage.id, to: activeIndex + 1 })}><ArrowRight size={16} /> Move page later <ArrowRight size={15} /></button>
                  <button type="button" className="action-row" onClick={() => pages.length < MAX_TOTAL_PAGES ? dispatch({ type: 'duplicate', pageId: activePage.id, newPageId: makeId() }) : showNotice('Workspace page limit reached.', true)}><Copy size={16} /> Duplicate current page <ArrowRight size={15} /></button>
                  <button type="button" className="action-row" onClick={() => dispatch({ type: 'rotate', pageId: activePage.id, direction: 'cw' })}><RotateCw size={16} /> Rotate clockwise <ArrowRight size={15} /></button>
                  <button type="button" className="action-row danger-text" onClick={deletePage}><Trash2 size={16} /> Remove current page <ArrowRight size={15} /></button>
                  {activePage.highlights.length > 0 && <><p className="subheading">Highlights</p>{activePage.highlights.map((mark, index) => <button type="button" key={mark.id} className="action-row" onClick={() => dispatch({ type: 'deleteHighlight', pageId: activePage.id, highlightId: mark.id })}><span className="color-dot" style={{ background: mark.color }} /> Highlight {index + 1} <Trash2 size={15} /></button>)}</>}
                </>}
              </section>
            )}
            <section className="property-section export-section"><div className="section-heading"><ArrowDownToLine size={17} /> Export options</div>
              <label className="form-label" htmlFor="exportMode">Pages to export</label>
              <div className="select-wrap"><select className="form-control" id="exportMode" value={exportMode} onChange={(e) => setExportMode(e.target.value as ExportMode)}><option value="all">All pages</option><option value="current">Current page only</option><option value="range">Custom page range</option></select><ChevronDown size={16} /></div>
              {exportMode === 'range' && <><label className="form-label" htmlFor="pageRange">Page numbers</label><input className="form-control" id="pageRange" placeholder="1-3, 5" value={pageRange} onChange={(e) => setPageRange(e.target.value)} /><p className="helper-text">Example: 1-3, 5, 8-10</p></>}
              <button className="button button-dark wide" type="button" onClick={() => void savePdf()} disabled={!pages.length || !!busy}><Download size={16} /> Download PDF</button>
            </section>
            <section className="property-section note-section"><div className="section-heading"><Info size={17} /> About editing</div>
              <p>Text boxes add selectable PDF text. Highlights use PDF annotations. Rewriting original page text is a separate research milestone and is <strong>not yet supported.</strong></p>
            </section>
          </div>
          <div className="privacy-footer"><ShieldCheck size={17} /><div><strong>100% on your device</strong><span>Files are never sent to a server.</span></div></div>
        </aside>
      </div>
      {notice && <div className={`toast ${notice.isError ? 'toast-error' : 'toast-success'}`} role={notice.isError ? 'alert' : 'status'}><span>{notice.isError ? <Info size={17} /> : <Check size={17} />}{notice.message}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button></div>}
    </div>
  );
}
