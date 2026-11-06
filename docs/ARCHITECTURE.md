# Architecture, safety and validation

## Design constraints

**Browser-only:** React + TypeScript + Vite, PDF.js, pdf-lib. No runtime API server, authentication, analytics, embedded ads, CDN scripts or remote fonts. GitHub Pages serves static assets. PDF bytes originate from user file inputs or the locally generated demo document.

**No mutation of source bytes:** `SourceDocument.bytes` is retained; `getDocument` receives a copy to avoid transferable-buffer detachment. `EditorPage` instances refer to the immutable source by id + page index; copying one source page multiple times is allowed. Imports append page instances. Commands produce new arrays and retain at most 40 undo snapshots. Source PDFs stay in memory until the page is reloaded.

**Rendering:** PDF.js draws only the active document page to a high-DPI canvas; lazy thumbnails render when they enter an IntersectionObserver margin. The selectable text layer is separate from the canvas. Preview highlights and text boxes are also independent overlays. We use the viewport's coordinate conversions to map browser selection rectangles back to source PDF coordinates.

**Export:** For each page instance, pdf-lib loads and caches the original document, copies the original source page into an output document, applies a 90°-increment rotation, draws new text runs and attaches highlight annotations (`/Highlight`, `/Rect`, `/QuadPoints`). After export, the browser downloads a Blob URL. The resulting PDF is not automatically overwritten at the original file location.

## Critical distinctions

- Added text boxes do **not** remove existing text. Hiding text behind a matching background is not the same as modifying the content stream and is **not** implemented as a fake 'edit existing text' feature.
- Selection-based highlighting generates annotation dictionaries, not burn-in pixels. Some PDF viewers may render their appearances differently. We currently do not synthesize `/AP` streams.
- Secure redaction needs complete removal of sensitive information, including metadata and orphaned objects. The product has no secure-redaction feature.
- Unicode text support using standard PDF fonts is limited to WinAnsi and a small supported subset; advanced font embedding is future work.
- Rotated text, complex transforms, ligatures, vertical writing, complex forms, PDF signatures and PDFs with damaged metadata require validation before claiming full compatibility.

## Next research spike: true existing-text replacement

1. Generate a one-page synthetic PDF with a single known text-show (`Tj`) operation and a standard unembedded font.
2. Identify the content stream and its `BT`/`ET`, `Tf`, `Tm`/`Td` and `Tj` operators. Correlate the selected text run with its exact bytes and font encoding; PDF.js text extraction alone is insufficient for operator identity.
3. Rewrite a fixed-length ASCII literal in the decoded stream, update stream lengths and affected objects, and save a structurally valid PDF without covering the old text.
4. Reopen with two independent parsers; assert old extracted text is absent, the replacement is present, text position/rotation are visually unchanged, and unrelated pages remain intact. Compare rendered image diffs.
5. Refuse unsupported encodings, subsets, glyph layouts, compressed object streams, shared resources and nontrivial text operators until each case has a testable implementation. Never label overlay concealment as secure redaction.

## Quality gates

Automated: page-ordering history, range parsing, page dimensions, PDF exported annotation dictionaries, and later PDF.js text extraction/image differences.

Manual test corpus: mixed sizes; 90° rotations; multi-column and selectable paragraphs; subset fonts/ligatures; image-only scans; form fields; 40+ pages; multiple uploads; malformed/encrypted files; emojis/unsupported glyphs; zoom at 50/100/200%; Firefox/Chromium/mobile.

Threats: memory exhaustion from large PDFs, spoofed MIME extensions, PDF.js parsing vulnerabilities, misleading privacy claims and retaining source text after apparently covering it. Keep pdfjs-dist current and review dependencies regularly. The 60 MB/source, 400-page/source and 600-page workspace limits are coarse guardrails rather than a full memory-budget solution.
