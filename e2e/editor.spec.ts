import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

test('demo opens, renders, rotates and exports a PDF', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /explore with a sample document/i }).click();
  await expect(page.locator('.thumb-row')).toHaveCount(3);
  await expect.poll(() => page.locator('.paper-canvas').evaluate((el) => (el as HTMLCanvasElement).width)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Rotate right' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('paperplane-edited.pdf');
  const bytes = new Uint8Array(await readFile(await download.path()));
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(3);
  expect(pdf.getPage(0).getRotation().angle).toBe(90);
  expect(errors).toEqual([]);
});

test('selectable text, highlight annotation and added text export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /explore with a sample document/i }).click();
  await expect(page.locator('.thumb-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Add text' }).click();
  await page.locator('.paper-surface').click({ position: { x: 180, y: 170 } });
  await expect(page.locator('.stamp')).toHaveCount(1);
  await page.getByLabel('Content').fill('E2E annotation');
  await expect(page.locator('.stamp')).toContainText('E2E annotation');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.pdf-text-layer span')).some((s) => (s.textContent?.length ?? 0) > 5));
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll('.pdf-text-layer span')).find((s) => (s.textContent?.length ?? 0) > 5);
    if (!span) throw new Error('No selectable text span');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(span);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.getByRole('button', { name: 'Highlight selection' }).click();
  await expect(page.locator('.highlight-overlay')).not.toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export PDF' }).click(),
  ]);
  const pdf = await PDFDocument.load(new Uint8Array(await readFile(await download.path())));
  expect(pdf.getPageCount()).toBe(3);
  expect(pdf.getPage(0).node.Annots()?.size()).toBeGreaterThan(0);
});

test('privacy: sample workspace does not request third-party resources', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: /explore with a sample document/i }).click();
  await expect(page.locator('.thumb-row')).toHaveCount(3);
  expect(external).toEqual([]);
});

test('defaults to fit-page and keeps a rotated PDF inside the visible workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 650 });
  await page.goto('/');
  await page.getByRole('button', { name: /explore with a sample document/i }).click();
  await expect(page.getByRole('combobox', { name: 'Zoom level' })).toHaveValue('fit-page');
  await expect(page.locator('.thumb-row')).toHaveCount(3);

  async function expectPageFits() {
    await expect.poll(async () => page.evaluate(() => {
      const area = document.querySelector('.document-canvas-area');
      const paper = document.querySelector('.paper-surface');
      if (!area || !paper) return false;
      const visibleWidth = area.clientWidth - 34;
      const visibleHeight = area.clientHeight - 34;
      return paper.clientWidth > 0 && paper.clientHeight > 0 &&
        paper.getBoundingClientRect().width <= visibleWidth + 1 &&
        paper.getBoundingClientRect().height <= visibleHeight + 1 &&
        area.scrollHeight <= area.clientHeight + 2;
    })).toBe(true);
  }

  await expectPageFits();
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await expectPageFits();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expectPageFits();
  await page.setViewportSize({ width: 960, height: 540 });
  await expectPageFits();
  await page.getByRole('combobox', { name: 'Zoom level' }).selectOption('2');
  await expect(page.getByRole('combobox', { name: 'Zoom level' })).toHaveValue('2');
  await expect(page.getByLabel('Current zoom')).toHaveText('200%');
  await page.getByRole('combobox', { name: 'Zoom level' }).selectOption('fit-page');
  await expectPageFits();
});
