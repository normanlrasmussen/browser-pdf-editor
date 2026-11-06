import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface SourceDocument {
  id: string;
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  pageCount: number;
}

export interface TextStamp {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  color: string;
  font: 'Helvetica' | 'HelveticaBold' | 'Courier';
}

export interface HighlightQuad {
  /** Rectangle in unrotated PDF user space; x/y origin is bottom-left. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface HighlightMark {
  id: string;
  quads: HighlightQuad[];
  color: string;
}

export interface EditorPage {
  /** A page instance is separate from its immutable source page; copies get new IDs. */
  id: string;
  sourceId: string;
  sourceIndex: number;
  rotation: 0 | 90 | 180 | 270;
  stamps: TextStamp[];
  highlights: HighlightMark[];
}

export type ToolMode = 'select' | 'text' | 'highlight';

export function makeId(): string {
  return crypto.randomUUID();
}
