import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { SourceDocument } from '../types';
import { makeId } from '../types';

// The worker is bundled at the same version as pdfjs-dist, including on Pages' subpath.
GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_FILE_BYTES = 60 * 1024 * 1024;
const MAX_SOURCE_PAGES = 400;

export async function openPdf(file: File): Promise<SourceDocument> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: 60 MB per-file limit exceeded.`);
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error(`${file.name}: expected a PDF file.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // PDF.js may transfer its input buffer to a worker: retain our own immutable copy.
  const loadingTask = getDocument({ data: bytes.slice(), isEvalSupported: false });
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (cause) {
    await loadingTask.destroy();
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Could not open ${file.name}: ${message}`);
  }
  if (pdf.numPages > MAX_SOURCE_PAGES) {
    await pdf.destroy();
    throw new Error(`${file.name}: the 400-page per-file limit was exceeded.`);
  }
  return { id: makeId(), name: file.name, bytes, pdf, pageCount: pdf.numPages };
}
