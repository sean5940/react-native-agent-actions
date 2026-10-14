// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { KOTLIN_PACKAGE, KOTLIN_SERVICE, KOTLIN_XML } from '../generators/kotlin.mjs';

export const KOTLIN_FILE = 'AgentActions.generated.kt';
export const KSP_VERSION = '2.3.12';

const START = '<!-- react-native-agent-actions:start -->';
const END = '<!-- react-native-agent-actions:end -->';

/**
 * @param {string} sourceDir
 * @returns {string}
 */
export function kotlinPath(sourceDir) {
  return path.join(sourceDir, ...KOTLIN_PACKAGE.split('.'), KOTLIN_FILE);
}

/**
 * Inserts, replaces or removes the AppFunctions service declaration in the app manifest.
 * @param {string} manifest
 * @param {boolean} enabled
 * @returns {string}
 */
export function updateManifest(manifest, enabled) {
  const pattern = new RegExp(`[ \\t]*${escape(START)}[\\s\\S]*?${escape(END)}\\n?`);
  const withoutBlock = manifest.replace(pattern, '');
  if (!enabled) {
    return withoutBlock;
  }
  const block = [
    `      ${START}`,
    '      <service',
    `        android:name="${KOTLIN_PACKAGE}.${KOTLIN_SERVICE}"`,
    '        android:permission="android.permission.BIND_APP_FUNCTION_SERVICE"',
    '        android:exported="true">',
    '        <property',
    '          android:name="android.app.appfunctions.schema"',
    '          android:value="app_functions_schema.xsd" />',
    '        <property',
    '          android:name="android.app.appfunctions.v2"',
    `          android:value="${KOTLIN_XML}.xml" />`,
    '        <intent-filter>',
    '          <action android:name="android.app.appfunctions.AppFunctionService" />',
    '        </intent-filter>',
    '      </service>',
    `      ${END}`,
    '',
  ].join('\n');
  const index = withoutBlock.lastIndexOf('</application>');
  if (index === -1) {
    throw new Error('Could not find </application> in the Android manifest.');
  }
  const lineStart = withoutBlock.lastIndexOf('\n', index) + 1;
  return withoutBlock.slice(0, lineStart) + block + withoutBlock.slice(lineStart);
}

/** @param {string} text */
function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Adds `apply from: .../agent-actions.gradle` to the app module build file.
 * @param {string} buildGradle
 * @param {string} scriptPath Path of agent-actions.gradle relative to the app module.
 * @returns {string | undefined} The updated file, or undefined when it already applies the script.
 */
export function updateAppBuildGradle(buildGradle, scriptPath) {
  if (buildGradle.includes('agent-actions.gradle')) {
    return undefined;
  }
  const line = `apply from: file(${JSON.stringify(scriptPath.split(path.sep).join('/'))}) // react-native-agent-actions`;
  return `${buildGradle.replace(/\s*$/, '')}\n\n${line}\n`;
}

/**
 * Adds the KSP Gradle plugin to the root build file's buildscript classpath.
 * @param {string} buildGradle
 * @returns {string | undefined} The updated file, or undefined when KSP is already there or the classpath block was not found.
 */
export function updateRootBuildGradle(buildGradle) {
  if (buildGradle.includes('com.google.devtools.ksp')) {
    return undefined;
  }
  const match = buildGradle.match(/^([ \t]*)classpath[ (]["']org\.jetbrains\.kotlin:kotlin-gradle-plugin[^\n]*\n/m);
  if (!match || match.index === undefined) {
    return undefined;
  }
  const indent = match[1] ?? '';
  const insertAt = match.index + match[0].length;
  const line = `${indent}classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:${KSP_VERSION}") // react-native-agent-actions\n`;
  return buildGradle.slice(0, insertAt) + line + buildGradle.slice(insertAt);
}

/**
 * @param {string} file
 * @returns {string | undefined}
 */
export function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}
