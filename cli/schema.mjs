// @ts-check

/**
 * The config shape users write is typed in src/config.ts. This module validates it at runtime
 * and turns it into the model below.
 *
 * @typedef {'string' | 'number' | 'integer' | 'boolean'} Primitive
 *
 * @typedef {object} Param
 * @property {string} name
 * @property {Primitive | 'stringArray'} type
 * @property {string} title
 * @property {string} description
 * @property {boolean} optional
 *
 * @typedef {{ kind: 'primitive', type: Primitive, description?: string, optional: boolean }
 *   | { kind: 'array', items: Value, description?: string, optional: boolean }
 *   | { kind: 'object', name: string, properties: Property[], description?: string, optional: boolean }} Value
 *
 * @typedef {object} Property
 * @property {string} name
 * @property {Value} value
 *
 * @typedef {object} Action
 * @property {string} name
 * @property {string} title
 * @property {string} description
 * @property {Param[]} params
 * @property {Value | undefined} result
 * @property {number} timeoutMs
 * @property {boolean} android
 * @property {boolean} ios
 * @property {string[]} phrases
 * @property {string | undefined} systemImageName
 *
 * @typedef {object} Schema
 * @property {Action[]} actions
 * @property {Map<string, Extract<Value, { kind: 'object' }>>} objects
 */

export const DEFAULT_TIMEOUT_MS = 10_000;
export const IOS_MAX_TIMEOUT_MS = 25_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_APP_SHORTCUTS = 10;
const PRIMITIVES = ['string', 'number', 'integer', 'boolean'];

// Identifiers end up in Kotlin, Swift and TypeScript, so any keyword of the three is rejected.
const RESERVED = new Set([
  'as', 'break', 'case', 'catch', 'class', 'continue', 'default', 'defer', 'do', 'else', 'enum',
  'extension', 'false', 'for', 'fun', 'func', 'guard', 'if', 'import', 'in', 'init', 'interface',
  'internal', 'is', 'let', 'nil', 'null', 'object', 'operator', 'package', 'private', 'protocol',
  'public', 'repeat', 'return', 'self', 'Self', 'static', 'struct', 'super', 'switch', 'this',
  'throw', 'throws', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'void', 'when', 'where',
  'while', 'with', 'yield', 'new', 'delete', 'function', 'const', 'export', 'extends', 'implements',
  'instanceof', 'debugger', 'finally', 'async', 'await', 'some', 'any', 'payload', 'context',
  // Methods every Android service inherits from java.lang.Object.
  'wait', 'notify', 'notifyAll', 'getClass', 'hashCode', 'equals', 'toString', 'clone', 'finalize',
]);

export class SchemaError extends Error {}

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function check(condition, message) {
  if (!condition) {
    throw new SchemaError(message);
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {string} name
 * @param {string} where
 */
function checkIdentifier(name, where) {
  check(/^[a-z][A-Za-z0-9]*$/.test(name), `${where}: "${name}" must be camelCase letters and digits, starting with a lowercase letter.`);
  check(!RESERVED.has(name), `${where}: "${name}" is a reserved word in Kotlin, Swift or TypeScript, or a method every Android service already has.`);
  check(!name.startsWith('agentActions'), `${where}: names starting with "agentActions" are used by the generated code.`);
}

/**
 * @param {unknown} text
 * @param {string} where
 * @param {boolean} required
 * @returns {string | undefined}
 */
function readText(text, where, required) {
  if (text === undefined && !required) {
    return undefined;
  }
  check(typeof text === 'string' && text.trim().length > 0, `${where} must be a non-empty string.`);
  return text.trim();
}

/** @param {string} name */
export function humanize(name) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * @param {string} name
 * @param {unknown} raw
 * @param {string} where
 * @returns {Param}
 */
function readParam(name, raw, where) {
  checkIdentifier(name, where);
  check(isRecord(raw), `${where} must be an object.`);
  const description = readText(raw.description, `${where}.description`, true) ?? '';
  const title = readText(raw.title, `${where}.title`, false) ?? humanize(name);
  check(raw.optional === undefined || typeof raw.optional === 'boolean', `${where}.optional must be a boolean.`);
  const optional = raw.optional === true;
  if (raw.type === 'array') {
    check(isRecord(raw.items) && raw.items.type === 'string', `${where}: array parameters only support string items.`);
    return { name, type: 'stringArray', title, description, optional };
  }
  check(typeof raw.type === 'string' && PRIMITIVES.includes(raw.type), `${where}.type must be one of ${PRIMITIVES.join(', ')} or array.`);
  return { name, type: /** @type {Primitive} */ (raw.type), title, description, optional };
}

/**
 * @param {unknown} raw
 * @param {string} where
 * @param {Map<string, Extract<Value, { kind: 'object' }>>} objects
 * @param {boolean} allowOptional
 * @returns {Value}
 */
function readValue(raw, where, objects, allowOptional) {
  check(isRecord(raw), `${where} must be an object.`);
  const description = readText(raw.description, `${where}.description`, false);
  check(raw.optional === undefined || typeof raw.optional === 'boolean', `${where}.optional must be a boolean.`);
  const optional = raw.optional === true;
  check(allowOptional || !optional, `${where}: only object properties can be optional.`);

  if (raw.type === 'array') {
    const items = readValue(raw.items, `${where}.items`, objects, false);
    check(items.kind !== 'array', `${where}: nested arrays are not supported.`);
    return { kind: 'array', items, description, optional };
  }
  if (raw.type === 'object') {
    check(typeof raw.name === 'string' && /^[A-Z][A-Za-z0-9]*$/.test(raw.name), `${where}.name must be PascalCase letters and digits, for example "Note".`);
    check(isRecord(raw.properties) && Object.keys(raw.properties).length > 0, `${where}.properties must list at least one property.`);
    const rawProperties = /** @type {Record<string, unknown>} */ (raw.properties);
    const properties = Object.entries(rawProperties).map(([propertyName, propertyRaw]) => {
      checkIdentifier(propertyName, `${where}.properties`);
      return { name: propertyName, value: readValue(propertyRaw, `${where}.properties.${propertyName}`, objects, true) };
    });
    /** @type {Extract<Value, { kind: 'object' }>} */
    const value = { kind: 'object', name: raw.name, properties, description, optional };
    const existing = objects.get(raw.name);
    if (existing) {
      check(JSON.stringify(shape(existing)) === JSON.stringify(shape(value)), `${where}: object type "${raw.name}" is declared twice with different properties.`);
    } else {
      objects.set(raw.name, value);
    }
    return value;
  }
  check(typeof raw.type === 'string' && PRIMITIVES.includes(raw.type), `${where}.type must be one of ${[...PRIMITIVES, 'array', 'object'].join(', ')}.`);
  return { kind: 'primitive', type: /** @type {Primitive} */ (raw.type), description, optional };
}

/**
 * The structure of a value without descriptions, used to compare two declarations of the same object type.
 * @param {Value} value
 * @returns {unknown}
 */
function shape(value) {
  if (value.kind === 'primitive') {
    return [value.type, value.optional];
  }
  if (value.kind === 'array') {
    return ['array', shape(value.items), value.optional];
  }
  return [value.name, value.optional, value.properties.map((property) => [property.name, shape(property.value)])];
}

/**
 * @param {string} name
 * @param {unknown} raw
 * @param {Map<string, Extract<Value, { kind: 'object' }>>} objects
 * @returns {Action}
 */
function readAction(name, raw, objects) {
  const where = `actions.${name}`;
  checkIdentifier(name, 'actions');
  check(isRecord(raw), `${where} must be an object.`);
  const title = readText(raw.title, `${where}.title`, true) ?? name;
  const description = readText(raw.description, `${where}.description`, true) ?? '';

  check(raw.params === undefined || isRecord(raw.params), `${where}.params must be an object.`);
  const rawParams = /** @type {Record<string, unknown>} */ (raw.params ?? {});
  const params = Object.entries(rawParams).map(([paramName, paramRaw]) => readParam(paramName, paramRaw, `${where}.params.${paramName}`));

  const result = raw.result === undefined ? undefined : readValue(raw.result, `${where}.result`, objects, false);

  const timeoutMs = raw.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  check(Number.isInteger(timeoutMs) && Number(timeoutMs) >= 100 && Number(timeoutMs) <= MAX_TIMEOUT_MS, `${where}.timeoutMs must be an integer between 100 and ${MAX_TIMEOUT_MS}.`);

  check(raw.platforms === undefined || (Array.isArray(raw.platforms) && raw.platforms.length > 0 && raw.platforms.every((p) => p === 'android' || p === 'ios')), `${where}.platforms must be a non-empty array of "android" and "ios".`);
  const platforms = /** @type {string[]} */ (raw.platforms ?? ['android', 'ios']);

  check(raw.ios === undefined || isRecord(raw.ios), `${where}.ios must be an object.`);
  const ios = /** @type {Record<string, unknown>} */ (raw.ios ?? {});
  check(ios.phrases === undefined || (Array.isArray(ios.phrases) && ios.phrases.every((p) => typeof p === 'string')), `${where}.ios.phrases must be an array of strings.`);
  const phrases = /** @type {string[]} */ (ios.phrases ?? []);
  for (const phrase of phrases) {
    check(phrase.includes('${applicationName}'), `${where}.ios.phrases: "${phrase}" must contain \${applicationName}. Write the phrase in a normal string, not a template literal.`);
  }
  const systemImageName = readText(ios.systemImageName, `${where}.ios.systemImageName`, false);

  return {
    name,
    title,
    description,
    params,
    result,
    timeoutMs: Number(timeoutMs),
    android: platforms.includes('android'),
    ios: platforms.includes('ios'),
    phrases,
    systemImageName,
  };
}

/**
 * Validates a config and turns it into the model the generators read.
 * @param {unknown} config
 * @returns {Schema}
 */
export function readSchema(config) {
  check(isRecord(config), 'The config must export an object.');
  check(isRecord(config.actions) && Object.keys(config.actions).length > 0, 'The config must declare at least one action under "actions".');
  /** @type {Map<string, Extract<Value, { kind: 'object' }>>} */
  const objects = new Map();
  const rawActions = /** @type {Record<string, unknown>} */ (config.actions);
  const actions = Object.entries(rawActions).map(([name, raw]) => readAction(name, raw, objects));

  const shortcuts = actions.filter((action) => action.ios && action.phrases.length > 0).length;
  check(shortcuts <= MAX_APP_SHORTCUTS, `iOS allows at most ${MAX_APP_SHORTCUTS} App Shortcuts, but ${shortcuts} actions declare phrases.`);
  return { actions, objects };
}

/** @param {string} name */
export function pascalCase(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
