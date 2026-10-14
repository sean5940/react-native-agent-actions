import type { AgentActionHandlers, Note } from './agentActions.generated';
import { withCallLog } from './callLog';

const loadedAt = Date.now();

const notes: Note[] = [
  {
    id: '1',
    title: 'Grocery list',
    tags: ['home', 'shopping'],
    pinned: true,
  },
  {
    id: '2',
    title: 'Trip to Busan',
    tags: ['travel'],
    pinned: false,
  },
  {
    id: '3',
    title: 'Release checklist',
    tags: ['work', 'shopping'],
    pinned: false,
  },
];

const archived = new Set<string>();

const activeNotes = () => notes.filter((note) => !archived.has(note.id));

export const handlers: AgentActionHandlers = {
  echo: withCallLog('echo', ({ text }) => text),

  searchNotes: withCallLog('searchNotes', ({ query, limit = 5 }) => {
    const needle = query.toLowerCase();
    return activeNotes()
      .map((note) => {
        const inTitle = note.title.toLowerCase().includes(needle);
        const inTags = note.tags.some((tag) => tag.includes(needle));
        return { ...note, score: inTitle ? 1 : inTags ? 0.5 : 0 };
      })
      .filter((note) => note.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }),

  summarizeNotes: withCallLog('summarizeNotes', () => {
    const active = activeNotes();
    const pinned = active.filter((note) => note.pinned);
    const tags = [...new Set(active.flatMap((note) => note.tags))].sort();
    const pinnedText =
      pinned.length > 0
        ? ` Pinned: ${pinned.map((note) => note.title).join(', ')}.`
        : '';
    return `You have ${active.length} notes.${pinnedText} Tags: ${tags.join(', ')}.`;
  }),

  getStats: withCallLog('getStats', () => ({
    noteCount: activeNotes().length,
    jsUptimeMs: Date.now() - loadedAt,
  })),

  archiveNote: withCallLog('archiveNote', ({ id }) => {
    if (!notes.some((note) => note.id === id)) {
      throw new Error(`No note with id ${id}.`);
    }
    archived.add(id);
  }),

  waitFor: withCallLog(
    'waitFor',
    ({ ms }) =>
      new Promise<number>((resolve) => setTimeout(() => resolve(ms), ms))
  ),

  fail: withCallLog('fail', (): string => {
    throw new Error('Handler failed on purpose');
  }),
};
