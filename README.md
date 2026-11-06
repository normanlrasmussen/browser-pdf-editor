# Paperplane — Private PDF Studio

A free, ad-free, no-account, **client-side PDF viewer and editor**, designed for GitHub Pages. All document processing happens locally in your browser. There are no upload endpoints, analytics, CDN scripts, or remote fonts.

> **Important:** This project does **not yet edit or securely redact existing PDF text**. Added text is new PDF content; the original page text remains intact. Existing-text replacement is an explicitly experimental research milestone.

## Current features

- Open PDFs stored on your device (including multiple PDFs at once), preview pages and thumbnails, and zoom.
- Combine multiple PDFs in any order. Drag page thumbnails to rearrange, duplicate, rotate, or delete pages.
- Add editable text boxes, drag them into position, change fonts, sizes, colors, and wrapping width.
- Select existing PDF text to highlight; export highlights as standard PDF annotation dictionaries (`/Subtype /Highlight`, `/QuadPoints`).
- Export all pages, the current page, or a selected sequence of page ranges (e.g. `1-3, 5`). This supports splitting documents by range.
- Undo/redo for page organization and annotations; keyboard shortcuts Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.
- Try the sample PDF without uploading anything.
- TypeScript types, unit tests for page manipulation and PDF export, GitHub Actions checks, and static Pages deployment.

## Local development

Install a current supported Node.js LTS release (Node 22+ recommended). Then:

```bash
git clone https://github.com/normanlrasmussen/browser-pdf-editor.git
cd browser-pdf-editor
npm install
npm run dev
```

Open the URL printed by Vite. Test before pushing:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e # after npx playwright install chromium
```

**Dependency pinning:** `package-lock.json` is committed. The CI and deployment workflows use `npm ci` for reproducible dependency installation.

## Deploy on GitHub Pages

1. In this repository, open **Settings → Pages** and set the source to **GitHub Actions**.
2. Merge reviewed changes into `main`.
3. The `deploy.yml` workflow builds and uploads `dist/`.
4. The site path will be `https://normanlrasmussen.github.io/browser-pdf-editor/`.

The Vite base is `/browser-pdf-editor/`. The PDF.js worker is emitted as a version-matched static asset in Vite's build. No server-side application is required.

## How editing works

- **PDF.js** parses pages and renders canvas/text layers in a version-matched Web Worker.
- **Immutable source bytes** are kept locally. Edits are represented as page instances, stamps, and highlight geometry.
- **pdf-lib** copies pages into a new document and writes stamps and annotations on export; the originals are never overwritten.
- For highlights, browser text selection rectangles are transformed into unrotated PDF-space quads. Interoperability needs testing against more PDF readers, rotated text, and complex writing directions.

Please read [Architecture & limitations](docs/ARCHITECTURE.md) before treating the app as a secure redaction or universal PDF-editing solution.

## Privacy & limitations

- Documents are not transmitted to a backend. The static site loads application assets only from GitHub Pages.
- Password-protected, malformed, large, and font-heavy PDFs may not be supported; each source file is capped at 60 MB and 400 pages, with a 600-page workspace limit.
- Standard Helvetica/Courier fonts used for added text have limited character coverage. Export errors are shown instead of silently rasterizing or pretending editing succeeded.
- True replacement of existing text, OCR, secure redaction, form-field editing, high-fidelity text box rotation, and persistent editable project files are **not implemented** yet.
- This repository has no final project license yet. Original code is written for this project; third-party licenses must be reviewed before copying source from elsewhere.

## Planned roadmap

1. Stabilize PDF renderer and thumbnails, round-trip export, page organizer and keyboard history.
2. Improve drag handles, cross-document selection/range handling, text box alignment/resizing and multi-line geometry.
3. Harden highlight annotation compatibility and test color/rotation/multi-column selection.
4. Build a constrained **genuine existing-text rewrite** proof of concept using PDF content-stream editing, font encoding, operator mapping and rigorous verification that the original text is no longer extractable.
5. Consider OCR, forms and secure redaction as explicitly separate features.

## Contributing

Please include a reproducible PDF fixture (or instructions to generate it), a regression test and a screenshot when fixing rendering/coordinate bugs. Never upload confidential PDFs in issues.
