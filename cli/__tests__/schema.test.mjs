import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readSchema, SchemaError } from '../schema.mjs';

/** @param {Record<string, unknown>} action */
const configWith = (action) => ({ actions: { doThing: { title: 'Do thing', description: 'Does the thing.', ...action } } });

describe('readSchema', () => {
  it('fills defaults for title, timeout and platforms', () => {
    const schema = readSchema(configWith({ params: { userName: { type: 'string', description: 'Who.' } } }));
    const action = schema.actions[0];
    assert.equal(action.timeoutMs, 10000);
    assert.equal(action.android, true);
    assert.equal(action.ios, true);
    assert.equal(action.params[0].title, 'User Name');
    assert.equal(action.params[0].optional, false);
  });

  it('rejects names that collide with generated code or keywords', () => {
    assert.throws(() => readSchema({ actions: { wait: { title: 'W', description: 'W.' } } }), SchemaError);
    assert.throws(() => readSchema({ actions: { class: { title: 'C', description: 'C.' } } }), SchemaError);
    assert.throws(() => readSchema({ actions: { agentActionsCall: { title: 'A', description: 'A.' } } }), SchemaError);
    assert.throws(() => readSchema({ actions: { DoThing: { title: 'D', description: 'D.' } } }), SchemaError);
  });

  it('requires descriptions on actions and params', () => {
    assert.throws(() => readSchema({ actions: { doThing: { title: 'Do thing' } } }), /description/);
    assert.throws(() => readSchema(configWith({ params: { a: { type: 'string' } } })), /description/);
  });

  it('only allows optional on object properties', () => {
    assert.throws(() => readSchema(configWith({ result: { type: 'string', optional: true } })), /only object properties/);
    const schema = readSchema(
      configWith({ result: { type: 'object', name: 'Thing', properties: { size: { type: 'number', optional: true } } } })
    );
    const result = schema.actions[0].result;
    assert.ok(result?.kind === 'object');
    assert.equal(result.properties[0].value.optional, true);
  });

  it('rejects nested arrays and non-string array params', () => {
    assert.throws(() => readSchema(configWith({ result: { type: 'array', items: { type: 'array', items: { type: 'string' } } } })), /nested arrays/);
    assert.throws(() => readSchema(configWith({ params: { ids: { type: 'array', items: { type: 'number' }, description: 'Ids.' } } })), /string items/);
  });

  it('rejects one object name used for two different shapes', () => {
    const a = { type: 'object', name: 'Item', properties: { id: { type: 'string' } } };
    const b = { type: 'object', name: 'Item', properties: { id: { type: 'number' } } };
    assert.throws(
      () => readSchema({ actions: { first: { title: 'F', description: 'F.', result: a }, second: { title: 'S', description: 'S.', result: b } } }),
      /declared twice/
    );
    const schema = readSchema({ actions: { first: { title: 'F', description: 'F.', result: a }, second: { title: 'S', description: 'S.', result: a } } });
    assert.equal(schema.objects.size, 1);
  });

  it('requires ${applicationName} in phrases and caps App Shortcuts at ten', () => {
    assert.throws(() => readSchema(configWith({ ios: { phrases: ['Do the thing'] } })), /applicationName/);
    const actions = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`action${i}`, { title: 'A', description: 'A.', ios: { phrases: ['Run ${applicationName}'] } }])
    );
    assert.throws(() => readSchema({ actions }), /at most 10/);
  });

  it('validates timeouts and platforms', () => {
    assert.throws(() => readSchema(configWith({ timeoutMs: 50 })), /timeoutMs/);
    assert.throws(() => readSchema(configWith({ platforms: ['web'] })), /platforms/);
    const schema = readSchema(configWith({ platforms: ['ios'] }));
    assert.equal(schema.actions[0].android, false);
  });
});
