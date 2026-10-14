import type { AgentActionHandlers, Note } from './agentActions.generated';

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

export const handlers: AgentActionHandlers = {
  echo: ({ text }) => text,

  searchNotes: ({ query, limit = 5 }) => {
    const needle = query.toLowerCase();
    return notes
      .filter((note) => !archived.has(note.id))
      .map((note) => {
        const inTitle = note.title.toLowerCase().includes(needle);
        const inTags = note.tags.some((tag) => tag.includes(needle));
        return { ...note, score: inTitle ? 1 : inTags ? 0.5 : 0 };
      })
      .filter((note) => note.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },

  getStats: () => ({
    noteCount: notes.length - archived.size,
    jsUptimeMs: Date.now() - loadedAt,
  }),

  archiveNote: ({ id }) => {
    if (!notes.some((note) => note.id === id)) {
      throw new Error(`No note with id ${id}.`);
    }
    archived.add(id);
  },

  waitFor: ({ ms }) =>
    new Promise((resolve) => setTimeout(() => resolve(ms), ms)),

  fail: () => {
    throw new Error('Handler failed on purpose');
  },
};
