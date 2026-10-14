// @ts-check

/**
 * @typedef {import('../schema.mjs').Schema} Schema
 * @typedef {import('../schema.mjs').Action} Action
 * @typedef {import('../schema.mjs').Param} Param
 * @typedef {import('../schema.mjs').Value} Value
 */

export const KOTLIN_PACKAGE = 'dev.agentactions.generated';
export const KOTLIN_SERVICE = 'AgentActionsService';
export const KOTLIN_XML = 'agent_actions';

/** @param {string} text */
function kotlinString(text) {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/\n/g, '\\n')}"`;
}

/** @param {string} text */
function kdocText(text) {
  return text.replace(/\*\//g, '*&#47;').replace(/\/\*/g, '/&#42;');
}

/**
 * @param {string[]} lines
 * @param {string} indent
 */
function kdoc(lines, indent) {
  const body = lines.flatMap((line) => kdocText(line).split('\n'));
  if (body.length === 1) {
    return [`${indent}/** ${body[0]} */`];
  }
  return [`${indent}/**`, ...body.map((line) => (line ? `${indent} * ${line}` : `${indent} *`)), `${indent} */`];
}

/** @param {Param} param */
function paramType(param) {
  const base = { string: 'String', number: 'Double', integer: 'Long', boolean: 'Boolean', stringArray: 'List<String>' }[param.type];
  return param.optional ? `${base}?` : base;
}

/**
 * @param {Value} value
 * @returns {string}
 */
function valueType(value) {
  /** @type {string} */
  let base;
  if (value.kind === 'primitive') {
    base = { string: 'String', number: 'Double', integer: 'Long', boolean: 'Boolean' }[value.type];
  } else if (value.kind === 'object') {
    base = value.name;
  } else if (value.items.kind === 'primitive') {
    base = { string: 'List<String>', number: 'DoubleArray', integer: 'LongArray', boolean: 'BooleanArray' }[value.items.type];
  } else {
    base = `List<${valueType({ ...value.items, optional: false })}>`;
  }
  return value.optional ? `${base}?` : base;
}

/**
 * Kotlin expression that reads `array` element `i`.
 * @param {Value} item
 */
function readArrayItem(item) {
  if (item.kind === 'object') {
    return `read${item.name}(array.getJSONObject(i))`;
  }
  if (item.kind === 'primitive') {
    return { string: 'array.getString(i)', number: 'array.getDouble(i)', integer: 'array.getLong(i)', boolean: 'array.getBoolean(i)' }[item.type];
  }
  throw new Error('Nested arrays are not supported.');
}

/**
 * Kotlin expression that turns `array` (a JSONArray) into the Kotlin type of an array value.
 * @param {Extract<Value, { kind: 'array' }>} value
 */
function readArray(value) {
  const item = value.items;
  if (item.kind === 'primitive' && item.type !== 'string') {
    const kind = { number: 'DoubleArray', integer: 'LongArray', boolean: 'BooleanArray' }[item.type];
    return `${kind}(array.length()) { i -> ${readArrayItem(item)} }`;
  }
  return `List(array.length()) { i -> ${readArrayItem(item)} }`;
}

/**
 * Kotlin expression that reads property `key` of the JSONObject `json`.
 * @param {Value} value
 * @param {string} key
 */
function readProperty(value, key) {
  const k = kotlinString(key);
  /** @type {string} */
  let read;
  if (value.kind === 'primitive') {
    read = { string: `json.getString(${k})`, number: `json.getDouble(${k})`, integer: `json.getLong(${k})`, boolean: `json.getBoolean(${k})` }[value.type];
  } else if (value.kind === 'object') {
    read = `read${value.name}(json.getJSONObject(${k}))`;
  } else {
    read = `json.getJSONArray(${k}).let { array -> ${readArray(value)} }`;
  }
  return value.optional ? `if (json.isNull(${k})) null else ${read}` : read;
}

/**
 * Kotlin expression that turns the decoded JSON value `result` into the declared result type.
 * @param {Value} value
 */
function readResult(value) {
  if (value.kind === 'primitive') {
    return {
      string: 'result as String',
      number: '(result as Number).toDouble()',
      integer: '(result as Number).toLong()',
      boolean: 'result as Boolean',
    }[value.type];
  }
  if (value.kind === 'object') {
    return `read${value.name}(result as JSONObject)`;
  }
  return `(result as JSONArray).let { array -> ${readArray(value)} }`;
}

/** @param {Extract<Value, { kind: 'object' }>} object */
function dataClass(object) {
  const lines = [];
  if (object.description) {
    lines.push(...kdoc([object.description], ''));
  }
  lines.push('@AppFunctionSerializable(isDescribedByKDoc = true)');
  lines.push(`public data class ${object.name}(`);
  for (const property of object.properties) {
    if (property.value.description) {
      lines.push(...kdoc([property.value.description], '  '));
    }
    lines.push(`  public val ${property.name}: ${valueType(property.value)},`);
  }
  lines.push(')');
  return lines.join('\n');
}

/** @param {Extract<Value, { kind: 'object' }>} object */
function reader(object) {
  const lines = [`private fun read${object.name}(json: JSONObject): ${object.name} =`, `  ${object.name}(`];
  for (const property of object.properties) {
    lines.push(`    ${property.name} = ${readProperty(property.value, property.name)},`);
  }
  lines.push('  )');
  return lines.join('\n');
}

/** @param {Param} param */
function putParam(param) {
  const key = kotlinString(param.name);
  const value = param.type === 'stringArray' ? `JSONArray(${param.name})` : param.name;
  const put = `payload.put(${key}, ${value})`;
  return param.optional ? `    if (${param.name} != null) ${put}` : `    ${put}`;
}

/** @param {Action} action */
function declaration(action) {
  const doc = [action.description];
  if (action.params.length > 0 || action.result?.description) {
    doc.push('');
  }
  for (const param of action.params) {
    doc.push(`@param ${param.name} ${param.description}`);
  }
  if (action.result?.description) {
    doc.push(`@return ${action.result.description}`);
  }

  const signature = action.params.map((param) => `${param.name}: ${paramType(param)}${param.optional ? ' = null' : ''}`).join(', ');
  const returns = action.result ? `: ${valueType(action.result)}` : '';
  const name = kotlinString(action.name);
  const lines = [...kdoc(doc, '  '), '  @AppFunctionDeclaration(isDescribedByKDoc = true)', `  public suspend fun ${action.name}(${signature})${returns} {`];
  lines.push('    val payload = JSONObject()');
  lines.push(...action.params.map(putParam));
  if (action.result) {
    lines.push(`    val result = agentActionsCall(${name}, payload, ${action.timeoutMs}L)`);
    lines.push(`    return agentActionsDecode(${name}) { ${readResult(action.result)} }`);
  } else {
    lines.push(`    agentActionsCall(${name}, payload, ${action.timeoutMs}L)`);
  }
  lines.push('  }');
  return lines.join('\n');
}

/**
 * Objects reachable from the actions exposed on Android, in declaration order.
 * @param {Action[]} actions
 */
function reachableObjects(actions) {
  /** @type {Map<string, Extract<Value, { kind: 'object' }>>} */
  const found = new Map();
  /** @param {Value | undefined} value */
  const visit = (value) => {
    if (!value) {
      return;
    }
    if (value.kind === 'array') {
      visit(value.items);
    } else if (value.kind === 'object' && !found.has(value.name)) {
      found.set(value.name, value);
      value.properties.forEach((property) => visit(property.value));
    }
  };
  actions.forEach((action) => visit(action.result));
  return [...found.values()];
}

/**
 * @param {Schema} schema
 * @returns {string | undefined} The Kotlin source, or undefined when no action targets Android.
 */
export function generateKotlin(schema) {
  const actions = schema.actions.filter((action) => action.android);
  if (actions.length === 0) {
    return undefined;
  }
  const objects = reachableObjects(actions);
  const usesArrays = actions.some((action) => action.params.some((param) => param.type === 'stringArray') || JSON.stringify(action.result ?? {}).includes('"kind":"array"'));

  const imports = [
    'androidx.appfunctions.AppFunctionAppUnknownException',
    'androidx.appfunctions.AppFunctionDeclaration',
    ...(objects.length > 0 ? ['androidx.appfunctions.AppFunctionSerializable'] : []),
    'androidx.appfunctions.AppFunctionService',
    'androidx.appfunctions.AppFunctionServiceEntryPoint',
    'dev.agentactions.AgentActionsDispatcher',
    'kotlin.coroutines.cancellation.CancellationException',
    ...(usesArrays ? ['org.json.JSONArray'] : []),
    'org.json.JSONObject',
  ];

  const sections = [
    '// Generated by react-native-agent-actions. Do not edit.',
    '// Change agent-actions.config and run `npx react-native-agent-actions generate`.',
    '@file:Suppress("RedundantVisibilityModifier", "unused")',
    '',
    `package ${KOTLIN_PACKAGE}`,
    '',
    imports.map((name) => `import ${name}`).join('\n'),
    '',
    ...objects.flatMap((object) => [dataClass(object), '']),
    '@AppFunctionServiceEntryPoint(',
    `  serviceName = ${kotlinString(KOTLIN_SERVICE)},`,
    `  appFunctionXmlFileName = ${kotlinString(KOTLIN_XML)},`,
    ')',
    `public abstract class ${KOTLIN_SERVICE}Base : AppFunctionService() {`,
    actions.map(declaration).join('\n\n'),
    '',
    '  private suspend fun agentActionsCall(action: String, payload: JSONObject, timeoutMs: Long): Any? {',
    '    val text =',
    '      try {',
    '        AgentActionsDispatcher.dispatch(this, action, payload.toString(), timeoutMs)',
    '      } catch (error: CancellationException) {',
    '        throw error',
    '      } catch (error: Exception) {',
    '        throw AppFunctionAppUnknownException(error.message)',
    '      }',
    '    // registerAgentActions sends { value, dialog }. The dialog is for Siri, so Android only reads the value.',
    '    return JSONObject(text).opt("value")',
    '  }',
    '}',
    '',
    'private inline fun <T> agentActionsDecode(action: String, read: () -> T): T =',
    '  try {',
    '    read()',
    '  } catch (error: Exception) {',
    '    throw AppFunctionAppUnknownException("The JavaScript handler for \\"$action\\" returned an unexpected value: ${error.message}")',
    '  }',
    ...objects.flatMap((object) => ['', reader(object)]),
    '',
  ];
  return sections.join('\n');
}
