import { describe, expect, it } from 'vitest';
import type { EditorPage } from '../types';
import { applyAction, historyReducer, initialHistory } from './history';

const page = (id: string): EditorPage => ({
  id, sourceId: 'source', sourceIndex: 0, rotation: 0, stamps: [], highlights: [],
});

describe('page organizer', () => {
  it('moves pages without mutating the previous array', () => {
    const original = [page('a'), page('b'), page('c')];
    const moved = applyAction(original, { type: 'move', pageId: 'a', to: 2 });
    expect(moved.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(original.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
  it('rotates counterclockwise and duplicates independently', () => {
    const rotated = applyAction([page('a')], { type: 'rotate', pageId: 'a', direction: 'ccw' });
    expect(rotated[0].rotation).toBe(270);
    const doubled = applyAction(rotated, { type: 'duplicate', pageId: 'a', newPageId: 'b' });
    expect(doubled).toHaveLength(2);
    expect(doubled[1].id).toBe('b');
  });
  it('undoes and redoes edits, clears redo after a new edit', () => {
    const s1 = historyReducer(initialHistory, { type: 'append', pages: [page('a'), page('b')] });
    const s2 = historyReducer(s1, { type: 'delete', pageId: 'a' });
    const s3 = historyReducer(s2, { type: 'undo' });
    expect(s3.present).toHaveLength(2);
    expect(historyReducer(s3, { type: 'redo' }).present).toHaveLength(1);
    const s4 = historyReducer(s3, { type: 'rotate', pageId: 'b', direction: 'cw' });
    expect(s4.future).toHaveLength(0);
  });
});
