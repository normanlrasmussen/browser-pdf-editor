import {
  degrees, PDFDocument, PDFHexString, PDFName, rgb, StandardFonts,
} from 'pdf-lib';
import type { EditorPage, HighlightMark, SourceDocument } from '../types';

export function parsePageRange(input: string, count: number): number[] {
  if (count === 0) throw new Error('There are no pages to export.');
  const tokens = input.split(',').map((t) => t.trim());
  if (!tokens.length || tokens.some((t) => !/^\d+(?:\s*-\s*\d+)?$/.test(t))) {
    throw new Error('Use page numbers like 1-3, 5, 8-10.');
  }
  const pages: number[] = [];
  for (const token of tokens) {
    const [from, to = from] = token.split(/\s*-\s*/).map(Number);
    if (from < 1 || to > count || from > to) throw new Error(`Page range must be between 1 and ${count}.`);
    for (let n = from; n <= to; n++) pages.push(n - 1);
  }
  return pages;
}

function parseColor(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Invalid color: ${hex}`);
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function addHighlightAnnotation(page: ReturnType<PDFDocument['addPage']>, mark: HighlightMark, document: PDFDocument) {
  if (!mark.quads.length) return;
  const [red, green, blue] = parseColor(mark.color);
  const bounds = mark.quads.reduce((acc, q) => ({
    left: Math.min(acc.left, q.left), right: Math.max(acc.right, q.right),
    bottom: Math.min(acc.bottom, q.bottom), top: Math.max(acc.top, q.top),
  }), { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity });
  const quadPoints = mark.quads.flatMap((q) => [
    q.left, q.top, q.right, q.top, q.left, q.bottom, q.right, q.bottom,
  ]);
  const annotation = document.context.obj({
    Type: 'Annot', Subtype: 'Highlight',
    Rect: [bounds.left, bounds.bottom, bounds.right, bounds.top],
    QuadPoints: quadPoints,
    C: [red, green, blue],
    CA: 0.45,
    F: 4,
    NM: PDFHexString.fromText(mark.id),
    Contents: PDFHexString.fromText('Highlighted in Paperplane'),
  });
  const annotationRef = document.context.register(annotation);
  const annots = page.node.Annots();
  if (annots) annots.push(annotationRef);
  else page.node.set(PDFName.of('Annots'), document.context.obj([annotationRef]));
}

/**
 * Each page is copied from immutable source bytes. The source file is never
 * rewritten. Existing text is NOT replaced; stamps are additional PDF content.
 */
export async function exportPages(
  pages: EditorPage[],
  sources: Record<string, SourceDocument>,
): Promise<Uint8Array> {
  if (!pages.length) throw new Error('Choose at least one page to export.');
  const output = await PDFDocument.create();
  const loadedSources = new Map<string, PDFDocument>();
  const embeddedFonts = new Map<string, Awaited<ReturnType<PDFDocument['embedFont']>>>();

  for (const item of pages) {
    const source = sources[item.sourceId];
    if (!source) throw new Error(`Source PDF for page ${item.id} is missing.`);
    let original = loadedSources.get(item.sourceId);
    if (!original) {
      original = await PDFDocument.load(source.bytes.slice(), { updateMetadata: false });
      loadedSources.set(item.sourceId, original);
    }
    const [page] = await output.copyPages(original, [item.sourceIndex]);
    output.addPage(page);
    page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360));

    for (const stamp of item.stamps) {
      const [r, g, b] = parseColor(stamp.color);
      let font = embeddedFonts.get(stamp.font);
      if (!font) {
        font = await output.embedFont(StandardFonts[stamp.font]);
        embeddedFonts.set(stamp.font, font);
      }
      page.drawText(stamp.text, {
        x: stamp.x, y: stamp.y, size: stamp.size, font, color: rgb(r, g, b),
        lineHeight: stamp.size * 1.3, maxWidth: stamp.width,
      });
    }
    for (const mark of item.highlights) addHighlightAnnotation(page, mark, output);
  }
  return output.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Delay revocation so browsers can finish resolving the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
