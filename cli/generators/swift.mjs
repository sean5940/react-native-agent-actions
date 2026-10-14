// @ts-check
import { IOS_MAX_TIMEOUT_MS, pascalCase } from '../schema.mjs';

/**
 * @typedef {import('../schema.mjs').Schema} Schema
 * @typedef {import('../schema.mjs').Action} Action
 * @typedef {import('../schema.mjs').Param} Param
 * @typedef {import('../schema.mjs').Value} Value
 */

export const SWIFT_FILE = 'AgentActions.generated.swift';

/** @param {string} text */
function swiftString(text) {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}

/** @param {Param} param */
function paramType(param) {
  const base = { string: 'String', number: 'Double', integer: 'Int', boolean: 'Bool', stringArray: '[String]' }[param.type];
  return param.optional ? `${base}?` : base;
}

/**
 * How a result is returned to App Intents: the Swift type and the conversion of the decoded JSON `result`.
 * @param {Action} action
 * @returns {{ type: string, convert: string, dialog: boolean } | undefined}
 */
function returnValue(action) {
  const value = action.result;
  if (!value) {
    return undefined;
  }
  const name = swiftString(action.name);
  if (value.kind === 'primitive') {
    const [type, helper] = /** @type {const} */ ({
      string: ['String', 'string'],
      number: ['Double', 'double'],
      integer: ['Int', 'int'],
      boolean: ['Bool', 'bool'],
    })[value.type];
    return { type, convert: `try AgentActionsResult.${helper}(result, action: ${name})`, dialog: value.type === 'string' };
  }
  if (value.kind === 'array' && value.items.kind === 'primitive') {
    const [type, helper] = /** @type {const} */ ({
      string: ['[String]', 'strings'],
      number: ['[Double]', 'doubles'],
      integer: ['[Int]', 'ints'],
      boolean: ['[Bool]', 'bools'],
    })[value.items.type];
    return { type, convert: `try AgentActionsResult.${helper}(result, action: ${name})`, dialog: false };
  }
  return { type: 'String', convert: `try AgentActionsResult.json(result, action: ${name})`, dialog: false };
}

/** @param {Action} action */
function intentName(action) {
  return `${pascalCase(action.name)}AgentIntent`;
}

/** @param {Action} action */
function intent(action) {
  const lines = ['@available(iOS 16.0, *)', `struct ${intentName(action)}: AppIntent {`];
  lines.push(`  static let title: LocalizedStringResource = ${swiftString(action.title)}`);
  lines.push(`  static let description = IntentDescription(${swiftString(action.description)})`);
  for (const param of action.params) {
    lines.push('');
    lines.push(`  @Parameter(title: ${swiftString(param.title)}, description: ${swiftString(param.description)})`);
    lines.push(`  var ${param.name}: ${paramType(param)}`);
  }
  lines.push('');

  const returns = returnValue(action);
  /** @type {string} */
  let resultType;
  if (!returns) {
    resultType = 'some IntentResult';
  } else if (returns.dialog) {
    resultType = `some IntentResult & ReturnsValue<${returns.type}> & ProvidesDialog`;
  } else {
    resultType = `some IntentResult & ReturnsValue<${returns.type}>`;
  }
  lines.push(`  func perform() async throws -> ${resultType} {`);
  lines.push(action.params.length > 0 ? '    var payload: [String: Any] = [:]' : '    let payload: [String: Any] = [:]');
  for (const param of action.params) {
    const key = swiftString(param.name);
    lines.push(param.optional ? `    if let ${param.name} { payload[${key}] = ${param.name} }` : `    payload[${key}] = ${param.name}`);
  }
  const timeoutMs = Math.min(action.timeoutMs, IOS_MAX_TIMEOUT_MS);
  const call = `try await AgentActionsDispatcher.shared.invoke(action: ${swiftString(action.name)}, payload: payload, timeoutMs: ${timeoutMs})`;
  if (!returns) {
    lines.push(`    _ = ${call}`);
    lines.push('    return .result()');
  } else {
    lines.push(`    let result = ${call}`);
    lines.push(`    let value = ${returns.convert}`);
    lines.push(returns.dialog ? '    return .result(value: value, dialog: "\\(value)")' : '    return .result(value: value)');
  }
  lines.push('  }');
  lines.push('}');
  return lines.join('\n');
}

/** @param {string} phrase */
function swiftPhrase(phrase) {
  const parts = phrase.split('${applicationName}').map((part) => swiftString(part).slice(1, -1));
  return `"${parts.join('\\(.applicationName)')}"`;
}

/** @param {Action[]} actions */
function shortcuts(actions) {
  const lines = ['@available(iOS 16.0, *)', 'struct AgentActionsShortcuts: AppShortcutsProvider {', '  static var appShortcuts: [AppShortcut] {'];
  for (const action of actions) {
    lines.push('    AppShortcut(');
    lines.push(`      intent: ${intentName(action)}(),`);
    lines.push(`      phrases: [${action.phrases.map(swiftPhrase).join(', ')}],`);
    lines.push(`      shortTitle: ${swiftString(action.title)},`);
    lines.push(`      systemImageName: ${swiftString(action.systemImageName ?? 'sparkles')}`);
    lines.push('    )');
  }
  lines.push('  }');
  lines.push('}');
  return lines.join('\n');
}

/**
 * @param {Schema} schema
 * @returns {string | undefined} The Swift source, or undefined when no action targets iOS.
 */
export function generateSwift(schema) {
  const actions = schema.actions.filter((action) => action.ios);
  if (actions.length === 0) {
    return undefined;
  }
  const withPhrases = actions.filter((action) => action.phrases.length > 0);
  const sections = [
    '// Generated by react-native-agent-actions. Do not edit.',
    '// Change agent-actions.config and run `npx react-native-agent-actions generate`.',
    'import AgentActionsCore',
    'import AppIntents',
    'import Foundation',
    '',
    actions.map(intent).join('\n\n'),
  ];
  if (withPhrases.length > 0) {
    sections.push('', shortcuts(withPhrases));
  }
  sections.push('');
  return sections.join('\n');
}
