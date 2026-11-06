import { describe, expect, it } from 'vitest';
import { calculateFitZoom, nextZoomStep } from './zoom';

describe('page fitting', () => {
  it('fits a portrait page within both available dimensions', () => {
    expect(calculateFitZoom({ width: 612, height: 792 }, { width: 580, height: 520 }, 'fit-page'))
      .toBeCloseTo(480 / 792);
  });
  it('recalculates for landscape rotation, shorter viewports and sidebars', () => {
    const available = { width: 580, height: 520 };
    const portrait = calculateFitZoom({ width: 612, height: 792 }, available, 'fit-page');
    const landscape = calculateFitZoom({ width: 792, height: 612 }, available, 'fit-page');
    expect(landscape).toBeCloseTo(540 / 792);
    expect(landscape).toBeGreaterThan(portrait);
    expect(calculateFitZoom({ width: 612, height: 792 }, { width: 580, height: 380 }, 'fit-page'))
      .toBeLessThan(portrait);
  });
  it('fits width separately and avoids a forced vertical fit', () => {
    const pdf = { width: 612, height: 792 };
    const area = { width: 580, height: 520 };
    expect(calculateFitZoom(pdf, area, 'fit-width')).toBeCloseTo(540 / 612);
    expect(calculateFitZoom(pdf, area, 'fit-width')).toBeGreaterThan(calculateFitZoom(pdf, area, 'fit-page'));
  });
  it('handles invalid measurements and clamps extreme zoom', () => {
    expect(calculateFitZoom({ width: 0, height: 0 }, { width: 120, height: 80 }, 'fit-page')).toBe(1);
    expect(calculateFitZoom({ width: 600, height: 800 }, { width: 1, height: 1 }, 'fit-page')).toBe(0.1);
    expect(calculateFitZoom({ width: 10, height: 10 }, { width: 1000, height: 1000 }, 'fit-page')).toBe(4);
  });
  it('zooms up or down from a fitted fractional scale', () => {
    expect(nextZoomStep(0.61, 1)).toBe(0.75);
    expect(nextZoomStep(0.61, -1)).toBe(0.5);
    expect(nextZoomStep(1, 1)).toBe(1.25);
    expect(nextZoomStep(1, -1)).toBe(0.75);
    expect(nextZoomStep(4, 1)).toBe(4);
    expect(nextZoomStep(0.25, -1)).toBe(0.25);
  });
});
