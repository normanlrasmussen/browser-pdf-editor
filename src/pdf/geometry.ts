import type { HighlightQuad } from '../types';

export interface ClientRectLike { left: number; right: number; top: number; bottom: number }
export interface PointConverter {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): number[];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Converts a browser-selected text rectangle into a source PDF-space quad. */
export function selectionRectToQuad(
  selection: ClientRectLike,
  page: ClientRectLike,
  viewport: PointConverter,
): HighlightQuad | null {
  const left = clamp(selection.left - page.left, 0, viewport.width);
  const right = clamp(selection.right - page.left, 0, viewport.width);
  const top = clamp(selection.top - page.top, 0, viewport.height);
  const bottom = clamp(selection.bottom - page.top, 0, viewport.height);
  if (right - left < 2 || bottom - top < 2) return null;
  const points = [
    viewport.convertToPdfPoint(left, top), viewport.convertToPdfPoint(right, top),
    viewport.convertToPdfPoint(left, bottom), viewport.convertToPdfPoint(right, bottom),
  ];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    left: Math.min(...xs), right: Math.max(...xs),
    bottom: Math.min(...ys), top: Math.max(...ys),
  };
}
