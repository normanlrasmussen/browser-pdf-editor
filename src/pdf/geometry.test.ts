import { describe, expect, it } from 'vitest';
import { selectionRectToQuad } from './geometry';

const page = { left: 100, top: 50, right: 300, bottom: 350 };

describe('text-selection geometry', () => {
  it('maps canvas rectangles into bottom-left PDF coordinates', () => {
    const result = selectionRectToQuad(
      { left: 120, right: 170, top: 70, bottom: 90 }, page,
      { width: 200, height: 300, convertToPdfPoint: (x, y) => [x, 300 - y] },
    );
    expect(result).toEqual({ left: 20, right: 70, top: 280, bottom: 260 });
  });
  it('handles rotation transformations without swapping page origin', () => {
    const result = selectionRectToQuad(
      { left: 120, right: 170, top: 70, bottom: 90 }, page,
      { width: 200, height: 300, convertToPdfPoint: (x, y) => [y, x] },
    );
    expect(result).toEqual({ left: 20, right: 40, top: 70, bottom: 20 });
  });
  it('clamps selection to the page and rejects empty rectangles', () => {
    expect(selectionRectToQuad(
      { left: 90, right: 120, top: 40, bottom: 70 }, page,
      { width: 200, height: 300, convertToPdfPoint: (x, y) => [x, y] },
    )).toEqual({ left: 0, right: 20, top: 20, bottom: 0 });
    expect(selectionRectToQuad(
      { left: 10, right: 20, top: 10, bottom: 20 }, page,
      { width: 200, height: 300, convertToPdfPoint: (x, y) => [x, y] },
    )).toBeNull();
  });
});
