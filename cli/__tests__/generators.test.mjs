import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateKotlin } from '../generators/kotlin.mjs';
import { generateShortcutStrings, generateSwift } from '../generators/swift.mjs';
import { generateTypeScript } from '../generators/typescript.mjs';
import { readSchema } from '../schema.mjs';

const note = {
  type: 'object',
  name: 'Note',
  description: 'A note.',
  properties: {
    id: { type: 'string', description: 'Id.' },
    tags: { type: 'array', items: { type: 'string' } },
    scores: { type: 'array', items: { type: 'number' } },
    rating: { type: 'integer', optional: true },
  },
};

const schema = readSchema({
  actions: {
    searchNotes: {
      title: 'Search notes',
      description: 'Finds notes. Ends a comment */ here.',
      params: {
        query: { type: 'string', description: 'Text "to" find.' },
        limit: { type: 'integer', optional: true, description: 'Max.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags.' },
      },
      result: { type: 'array', items: note, description: 'Notes.' },
      timeoutMs: 40000,
      ios: { phrases: ['Search "notes" in ${applicationName}'] },
    },
    countNotes: { title: 'Count notes', description: 'Counts.', result: { type: 'integer' } },
    clearNotes: { title: 'Clear notes', description: 'Clears.', platforms: ['android'] },
    sayHello: { title: 'Say hello', description: 'Greets.', result: { type: 'string' }, platforms: ['ios'] },
  },
});

describe('generateKotlin', () => {
  const kotlin = generateKotlin(schema) ?? '';

  it('declares functions inside the entry point service with KDoc', () => {
    assert.match(kotlin, /@AppFunctionServiceEntryPoint\(\n {2}serviceName = "AgentActionsService",\n {2}appFunctionXmlFileName = "agent_actions",\n\)/);
    assert.match(kotlin, /public suspend fun searchNotes\(query: String, limit: Long\? = null, tags: List<String>\): List<Note> \{/);
    assert.match(kotlin, /public suspend fun clearNotes\(\) \{/);
    assert.doesNotMatch(kotlin, /sayHello/);
    assert.match(kotlin, /Ends a comment \*&#47; here\./);
  });

  it('maps arrays to the types AppFunctions supports', () => {
    assert.match(kotlin, /public val tags: List<String>,/);
    assert.match(kotlin, /public val scores: DoubleArray,/);
    assert.match(kotlin, /public val rating: Long\?,/);
    assert.match(kotlin, /scores = json\.getJSONArray\("scores"\)\.let \{ array -> DoubleArray\(array\.length\(\)\) \{ i -> array\.getDouble\(i\) \} \}/);
    assert.match(kotlin, /rating = if \(json\.isNull\("rating"\)\) null else json\.getLong\("rating"\)/);
  });

  it('reads the value out of the reply envelope', () => {
    assert.match(kotlin, /return JSONObject\(text\)\.opt\("value"\)/);
  });

  it('sends params and keeps the configured timeout', () => {
    assert.match(kotlin, /if \(limit != null\) payload\.put\("limit", limit\)/);
    assert.match(kotlin, /payload\.put\("tags", JSONArray\(tags\)\)/);
    assert.match(kotlin, /agentActionsCall\("searchNotes", payload, 40000L\)/);
  });

  it('returns nothing when no action targets Android', () => {
    assert.equal(generateKotlin(readSchema({ actions: { a: { title: 'A', description: 'A.', platforms: ['ios'] } } })), undefined);
  });
});

describe('generateSwift', () => {
  const swift = generateSwift(schema) ?? '';

  it('generates an App Intent per iOS action', () => {
    assert.match(swift, /struct SearchNotesAgentIntent: AppIntent \{/);
    assert.match(swift, /struct SayHelloAgentIntent: AppIntent \{/);
    assert.doesNotMatch(swift, /ClearNotes/);
    assert.match(swift, /@Parameter\(title: "Query", description: "Text \\"to\\" find\."\)\n {2}var query: String/);
    assert.match(swift, /var limit: Int\?/);
    assert.match(swift, /var tags: \[String\]/);
    assert.match(swift, /if let limit \{ payload\["limit"\] = limit \}/);
  });

  it('returns objects as JSON and primitives as typed values', () => {
    assert.match(swift, /ReturnsValue<String> & ProvidesDialog \{\n[\s\S]*?AgentActionsResult\.json\(reply\.value, action: "searchNotes"\)/);
    assert.match(swift, /ReturnsValue<Int> & ProvidesDialog/);
  });

  it('lets the handler choose the dialog and falls back to the string result', () => {
    assert.match(swift, /AgentActionsResult\.string\(reply\.value, action: "sayHello"\)\n {4}return \.result\(value: value, dialog: "\\\(reply\.dialog \?\? value\)"\)/);
    assert.match(swift, /AgentActionsResult\.int\(reply\.value, action: "countNotes"\)\n {4}return \.result\(value: value, dialog: "\\\(reply\.dialog \?\? ""\)"\)/);
  });

  it('writes one AppShortcuts.strings per locale, keyed by the base phrase', () => {
    const localized = readSchema({
      actions: {
        countNotes: {
          title: 'Count notes',
          description: 'Counts.',
          ios: { phrases: ['Count "notes" in ${applicationName}'], localizedPhrases: { ko: ['${applicationName}에서 노트 세기'] } },
        },
      },
    });
    const files = generateShortcutStrings(localized);
    assert.deepEqual([...files.keys()], ['ko']);
    assert.match(files.get('ko') ?? '', /"Count \\"notes\\" in \$\{applicationName\}" = "\$\{applicationName\}에서 노트 세기";/);
    assert.equal(generateShortcutStrings(schema).size, 0);
  });

  it('caps the timeout below the 30 second App Intents limit', () => {
    assert.match(swift, /invoke\(action: "searchNotes", payload: payload, timeoutMs: 25000\)/);
  });

  it('turns phrases into App Shortcuts', () => {
    assert.match(swift, /struct AgentActionsShortcuts: AppShortcutsProvider/);
    assert.match(swift, /phrases: \["Search \\"notes\\" in \\\(\.applicationName\)"\]/);
  });
});

describe('generateTypeScript', () => {
  const ts = generateTypeScript(schema);

  it('generates params, results and the handler map', () => {
    assert.match(ts, /export interface Note \{/);
    assert.match(ts, /rating\?: number \| null;/);
    assert.match(ts, /export interface SearchNotesParams \{[\s\S]*?limit\?: number;[\s\S]*?tags: string\[\];/);
    assert.match(ts, /import type \{ AgentActionResult \} from 'react-native-agent-actions';/);
    assert.match(ts, /searchNotes\(params: SearchNotesParams\): AgentActionResult<Note\[\]>;/);
    assert.match(ts, /countNotes\(params: Record<string, never>\): AgentActionResult<number>;/);
    assert.match(ts, /clearNotes\(params: Record<string, never>\): AgentActionResult<void>;/);
  });
});
