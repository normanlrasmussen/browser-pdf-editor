/** Page-fit and manual zoom calculations use PDF.js viewport dimensions at scale 1. */
export type ZoomMode = 'fit-page' | 'fit-width' | 'custom';
export interface Dimensions { width: number; height: number }
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
const MIN_FIT_SCALE = 0.1;
const MAX_SCALE = 4;
// Match the 16px scroll-area padding with a little room for shadow and borders.
const FRAME_GUTTER = 40;

export function calculateFitZoom(
  page: Dimensions,
  area: Dimensions,
  mode: Exclude<ZoomMode, 'custom'>,
): number {
  if (![page.width, page.height, area.width, area.height].every(
    (dimension) => Number.isFinite(dimension) && dimension > 0,
  )) return 1;
  const horizontal = Math.max(1, area.width - FRAME_GUTTER) / page.width;
  const vertical = Math.max(1, area.height - FRAME_GUTTER) / page.height;
  const scale = mode === 'fit-width' ? horizontal : Math.min(horizontal, vertical);
  return Math.max(MIN_FIT_SCALE, Math.min(MAX_SCALE, scale));
}

export function nextZoomStep(current: number, direction: -1 | 1): number {
  const epsilon = 1e-6;
  if (direction === 1) return ZOOM_PRESETS.find((step) => step > current + epsilon) ?? ZOOM_PRESETS[ZOOM_PRESETS.length - 1];
  return [...ZOOM_PRESETS].reverse().find((step) => step < current - epsilon) ?? ZOOM_PRESETS[0];
}
