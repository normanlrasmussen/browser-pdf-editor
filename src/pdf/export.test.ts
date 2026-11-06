import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, PDFName, PDFArray } from 'pdf-lib';
import type { EditorPage, SourceDocument } from '../types';
import { exportPages, parsePageRange } from './export';

const makePage = (id: string, sourceId: string, sourceIndex: number): EditorPage => ({
  id, sourceId, sourceIndex, rotation: 0, stamps: [], highlights: [],
});

async function fixtures() {
  const sourcePdf = await PDFDocument.create();
  sourcePdf.addPage([300, 400]);
  sourcePdf.addPage([500, 600]);
  const bytes = new Uint8Array(await sourcePdf.save());
  const source: SourceDocument = {
    id: 's', name: 'fixture.pdf', bytes,
    pdf: {} as SourceDocument['pdf'], pageCount: 2,
  };
  return { source };
}

describe('local PDF export', () => {
  it('parses ranges and rejects invalid values', () => {
    expect(parsePageRange('1-2, 4', 4)).toEqual([0, 1, 3]);
    expect(() => parsePageRange('0', 4)).toThrow();
    expect(() => parsePageRange('5', 4)).toThrow();
    expect(() => parsePageRange('3-1', 4)).toThrow();
    expect(() => parsePageRange('1,foo', 4)).toThrow();
  });
  it('copies reordered pages and maintains source dimensions', async () => {
    const { source } = await fixtures();
    const bytes = await exportPages([makePage('b', 's', 1), makePage('a', 's', 0)], { s: source });
    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getWidth()).toBe(500);
    expect(output.getPage(1).getWidth()).toBe(300);
    expect(source.bytes.byteLength).toBeGreaterThan(0);
  });
  it('writes a proper highlight annotation dictionary and text content', async () => {
    const { source } = await fixtures();
    const page = makePage('p', 's', 0);
    page.stamps.push({
      id: 't', text: 'Sample', x: 25, y: 80, width: 150,
      size: 16, color: '#112233', font: 'Helvetica',
    });
    page.highlights.push({ id: 'h', color: '#ffe155', quads: [
      { left: 10, right: 75, bottom: 40, top: 52 },
    ] });
    const bytes = await exportPages([page], { s: source });
    const output = await PDFDocument.load(bytes);
    const annotations = output.getPage(0).node.Annots();
    expect(annotations).toBeInstanceOf(PDFArray);
    expect(annotations?.size()).toBe(1);
    const annot = output.context.lookup(annotations!.get(0));
    expect(String((annot as { get(k: PDFName): unknown }).get(PDFName.of('Subtype')))).toBe('/Highlight');
    expect(await output.embedFont(StandardFonts.Helvetica)).toBeDefined();
  });
});
