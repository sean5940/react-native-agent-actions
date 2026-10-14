import { reply } from 'react-native-agent-actions';
import type { AgentActionHandlers, Note } from './agentActions.generated';
import { withCallLog } from './callLog';

const loadedAt = Date.now();

// Siri speaks the dialog as is, so write it in the language of the device.
const korean = Intl.DateTimeFormat().resolvedOptions().locale.startsWith('ko');

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
    const found = activeNotes()
      .map((note) => {
        const inTitle = note.title.toLowerCase().includes(needle);
        const inTags = note.tags.some((tag) => tag.includes(needle));
        return { ...note, score: inTitle ? 1 : inTags ? 0.5 : 0 };
      })
      .filter((note) => note.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    const titles = found.map((note) => note.title).join(', ');
    return reply(found, {
      dialog: korean
        ? `노트 ${found.length}개를 찾았어요. ${titles}`
        : `Found ${found.length} notes. ${titles}`,
    });
  }),

  summarizeNotes: withCallLog('summarizeNotes', () => {
    const active = activeNotes();
    const pinned = active
      .filter((note) => note.pinned)
      .map((note) => note.title)
      .join(', ');
    const tags = [...new Set(active.flatMap((note) => note.tags))]
      .sort()
      .join(', ');
    if (korean) {
      return `노트가 ${active.length}개 있어요. 고정: ${pinned || '없음'}. 태그: ${tags}.`;
    }
    return `You have ${active.length} notes. Pinned: ${pinned || 'none'}. Tags: ${tags}.`;
  }),

  getStats: withCallLog('getStats', () => {
    const stats = {
      noteCount: activeNotes().length,
      jsUptimeMs: Date.now() - loadedAt,
    };
    return reply(stats, {
      dialog: korean
        ? `노트가 ${stats.noteCount}개 있어요.`
        : `You have ${stats.noteCount} notes.`,
    });
  }),

  archiveNote: withCallLog('archiveNote', ({ id }) => {
    const note = notes.find((candidate) => candidate.id === id);
    if (!note) {
      throw new Error(
        korean ? `${id}번 노트가 없어요.` : `No note with id ${id}.`
      );
    }
    archived.add(id);
    return reply(undefined, {
      dialog: korean
        ? `"${note.title}" 노트를 보관했어요.`
        : `Archived "${note.title}".`,
    });
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
