import type { EditorPage, HighlightMark, TextStamp } from '../types';

export type EditorAction =
  | { type: 'append'; pages: EditorPage[] }
  | { type: 'move'; pageId: string; to: number }
  | { type: 'delete'; pageId: string }
  | { type: 'duplicate'; pageId: string; newPageId: string }
  | { type: 'rotate'; pageId: string; direction: 'cw' | 'ccw' }
  | { type: 'addStamp'; pageId: string; stamp: TextStamp }
  | { type: 'updateStamp'; pageId: string; stampId: string; changes: Partial<TextStamp> }
  | { type: 'deleteStamp'; pageId: string; stampId: string }
  | { type: 'addHighlight'; pageId: string; highlight: HighlightMark }
  | { type: 'deleteHighlight'; pageId: string; highlightId: string };

export interface HistoryState {
  past: EditorPage[][];
  present: EditorPage[];
  future: EditorPage[][];
}

export type HistoryAction = EditorAction | { type: 'undo' } | { type: 'redo' };
export const initialHistory: HistoryState = { past: [], present: [], future: [] };
const HISTORY_LIMIT = 40;

export function applyAction(pages: EditorPage[], action: EditorAction): EditorPage[] {
  switch (action.type) {
    case 'append':
      return action.pages.length ? [...pages, ...action.pages] : pages;
    case 'delete':
      return pages.some((p) => p.id === action.pageId)
        ? pages.filter((p) => p.id !== action.pageId) : pages;
    case 'move': {
      const from = pages.findIndex((p) => p.id === action.pageId);
      if (from === -1 || action.to < 0 || action.to >= pages.length || from === action.to) return pages;
      const reordered = [...pages];
      reordered.splice(action.to, 0, ...reordered.splice(from, 1));
      return reordered;
    }
    case 'duplicate': {
      const index = pages.findIndex((p) => p.id === action.pageId);
      if (index === -1) return pages;
      const original = pages[index];
      const copy: EditorPage = {
        ...original, id: action.newPageId,
        stamps: original.stamps.map((s) => ({ ...s, id: `${action.newPageId}-${s.id}` })),
        highlights: original.highlights.map((h) => ({
          ...h, id: `${action.newPageId}-${h.id}`, quads: h.quads.map((q) => ({ ...q })),
        })),
      };
      return [...pages.slice(0, index + 1), copy, ...pages.slice(index + 1)];
    }
    case 'rotate':
      return pages.map((p) => p.id === action.pageId ? {
        ...p, rotation: ((p.rotation + (action.direction === 'cw' ? 90 : 270)) % 360) as EditorPage['rotation'],
      } : p);
    case 'addStamp':
      return pages.map((p) => p.id === action.pageId ? { ...p, stamps: [...p.stamps, action.stamp] } : p);
    case 'updateStamp':
      if (!pages.some((p) => p.id === action.pageId && p.stamps.some((s) => s.id === action.stampId && Object.entries(action.changes).some(([key, value]) => s[key as keyof TextStamp] !== value)))) return pages;
      return pages.map((p) => p.id === action.pageId ? {
        ...p, stamps: p.stamps.map((s) => s.id === action.stampId ? { ...s, ...action.changes } : s),
      } : p);
    case 'deleteStamp':
      return pages.map((p) => p.id === action.pageId ? {
        ...p, stamps: p.stamps.filter((s) => s.id !== action.stampId),
      } : p);
    case 'addHighlight':
      return pages.map((p) => p.id === action.pageId ? {
        ...p, highlights: [...p.highlights, action.highlight],
      } : p);
    case 'deleteHighlight':
      return pages.map((p) => p.id === action.pageId ? {
        ...p, highlights: p.highlights.filter((h) => h.id !== action.highlightId),
      } : p);
  }
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1],
      future: [state.present, ...state.future],
    };
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: state.future[0],
      future: state.future.slice(1),
    };
  }
  const next = applyAction(state.present, action);
  if (next === state.present) return state;
  return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}
