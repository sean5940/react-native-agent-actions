import type { AgentActionsConfig } from 'react-native-agent-actions';

const note = {
  type: 'object',
  name: 'Note',
  description: 'A note saved in the app.',
  properties: {
    id: { type: 'string', description: 'Stable identifier of the note.' },
    title: { type: 'string', description: 'Title of the note.' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tags attached to the note.',
    },
    pinned: { type: 'boolean', description: 'Whether the note is pinned.' },
    score: {
      type: 'number',
      optional: true,
      description: 'How well the note matches the query, from 0 to 1.',
    },
  },
} as const;

export default {
  actions: {
    echo: {
      title: 'Echo',
      description:
        'Returns the given text unchanged. Use it to check that the app responds.',
      params: {
        text: { type: 'string', description: 'Text to send back.' },
      },
      result: { type: 'string', description: 'The same text.' },
      ios: {
        phrases: ['Echo with ${applicationName}'],
        systemImageName: 'text.bubble',
      },
    },
    searchNotes: {
      title: 'Search notes',
      description: 'Finds notes whose title or tags contain the query.',
      params: {
        query: { type: 'string', description: 'Text to look for.' },
        limit: {
          type: 'integer',
          optional: true,
          description: 'Maximum number of notes to return. Defaults to 5.',
        },
      },
      result: {
        type: 'array',
        items: note,
        description: 'Matching notes, best match first.',
      },
      ios: {
        phrases: ['Search notes in ${applicationName}'],
        systemImageName: 'magnifyingglass',
      },
    },
    summarizeNotes: {
      title: 'Summarize notes',
      description:
        'Returns a one-sentence summary of the saved notes: how many there are, which are pinned and which tags they use.',
      result: { type: 'string', description: 'The summary.' },
      ios: {
        phrases: ['Summarize notes in ${applicationName}'],
        systemImageName: 'text.alignleft',
      },
    },
    getStats: {
      title: 'Get app stats',
      description:
        'Reports how many notes exist and how long the JavaScript runtime has been running.',
      result: {
        type: 'object',
        name: 'Stats',
        properties: {
          noteCount: { type: 'integer', description: 'Number of saved notes.' },
          jsUptimeMs: {
            type: 'number',
            description: 'Milliseconds since the JavaScript bundle was loaded.',
          },
        },
      },
      ios: {
        phrases: ['Get stats from ${applicationName}'],
        systemImageName: 'chart.bar',
      },
    },
    archiveNote: {
      title: 'Archive note',
      description: 'Archives the note with the given id.',
      params: {
        id: {
          type: 'string',
          description: 'Identifier of the note to archive.',
        },
      },
    },
    waitFor: {
      title: 'Wait in JavaScript',
      description:
        'Waits for the given time before answering. Used to test timeouts.',
      params: {
        ms: {
          type: 'integer',
          title: 'Milliseconds',
          description: 'How long to wait, in milliseconds.',
        },
      },
      result: {
        type: 'integer',
        description: 'The time waited, in milliseconds.',
      },
      timeoutMs: 25000,
    },
    fail: {
      title: 'Fail in JavaScript',
      description: 'Always fails. Used to test how errors reach the agent.',
      result: { type: 'string' },
      ios: {
        phrases: ['Fail with ${applicationName}'],
        systemImageName: 'xmark.octagon',
      },
    },
  },
} satisfies AgentActionsConfig;
