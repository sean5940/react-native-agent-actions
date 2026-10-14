#!/usr/bin/env node
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { generateKotlin } from './generators/kotlin.mjs';
import { generateShortcutStrings, generateSwift, SHORTCUTS_STRINGS_FILE, STRINGS_HEADER, SWIFT_FILE } from './generators/swift.mjs';
import { generateTypeScript } from './generators/typescript.mjs';
import { kotlinPath, readIfExists, updateAppBuildGradle, updateManifest, updateRootBuildGradle } from './integrate/android.mjs';
import { addFileToXcodeProject, findXcodeproj, syncShortcutStrings, updateInfoPlist, updatePodfile } from './integrate/ios.mjs';
import { IOS_MAX_TIMEOUT_MS, readSchema, SchemaError } from './schema.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_NAMES = ['agent-actions.config.ts', 'agent-actions.config.mts', 'agent-actions.config.js', 'agent-actions.config.mjs', 'agent-actions.config.cjs', 'agent-actions.config.json'];

const HELP = `Usage: react-native-agent-actions generate [options]

Reads agent-actions.config.* and generates the Android AppFunctions service, the iOS App Intents
and the TypeScript handler types. It also wires them into the native projects.

Options:
  --root <dir>      React Native project root (default: current directory)
  --config <file>   Config file (default: agent-actions.config.{ts,mts,js,mjs,cjs,json} in the root)
  --check           Exit with an error if generated files are out of date. Writes nothing.
  -h, --help        Show this help
`;

/** @param {string} message */
function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

/**
 * @param {string} root
 * @param {string | undefined} explicit
 */
function findConfig(root, explicit) {
  if (explicit) {
    const file = path.resolve(root, explicit);
    if (!fs.existsSync(file)) {
      fail(`Config file not found: ${file}`);
    }
    return file;
  }
  const found = CONFIG_NAMES.map((name) => path.join(root, name)).find((file) => fs.existsSync(file));
  if (!found) {
    fail(`No config found in ${root}. Create agent-actions.config.ts (see the README).`);
  }
  return /** @type {string} */ (found);
}

/**
 * Loading a .ts config makes Node warn about type stripping and the package's module type.
 * Those warnings are about Node itself, not about the config, so they are hidden.
 */
function hideTypeStrippingWarnings() {
  const listeners = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    const code = /** @type {{ code?: string }} */ (warning).code;
    if (code === 'MODULE_TYPELESS_PACKAGE_JSON' || (warning.name === 'ExperimentalWarning' && /Type Stripping/i.test(warning.message))) {
      return;
    }
    listeners.forEach((listener) => listener(warning));
  });
}

/** @param {string} file */
async function loadConfig(file) {
  if (file.endsWith('.json')) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  hideTypeStrippingWarnings();
  try {
    const module = await import(pathToFileURL(file).href);
    return module.default ?? module;
  } catch (error) {
    const code = /** @type {{ code?: string }} */ (error).code;
    if (code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      fail(`Node ${process.versions.node} cannot load TypeScript files. Use Node 22.18 or later, or write the config as .mjs or .json.`);
    }
    throw error;
  }
}

/**
 * @typedef {object} Output
 * @property {string} file
 * @property {string | undefined} content Undefined deletes the file.
 */

/** @param {Output[]} outputs */
function staleOutputs(outputs) {
  return outputs.filter((output) => readIfExists(output.file) !== output.content);
}

/** @param {string} file */
function relative(file) {
  return path.relative(process.cwd(), file) || '.';
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      config: { type: 'string' },
      check: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const command = positionals[0] ?? 'generate';
  if (values.help || command !== 'generate') {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }

  const root = path.resolve(values.root ?? process.cwd());
  const configFile = findConfig(root, values.config);
  /** @type {import('./schema.mjs').Schema} */
  let schema;
  /** @type {any} */
  let config;
  try {
    config = await loadConfig(configFile);
    schema = readSchema(config);
  } catch (error) {
    if (error instanceof SchemaError) {
      fail(`${relative(configFile)}: ${error.message}`);
    }
    throw error;
  }

  const android = config.android ?? {};
  const ios = config.ios ?? {};
  const androidSourceDir = path.resolve(root, android.sourceDir ?? 'android/app/src/main/java');
  const manifestPath = path.resolve(root, android.manifestPath ?? 'android/app/src/main/AndroidManifest.xml');
  const iosDir = path.join(root, 'ios');
  const xcodeproj = ios.xcodeproj ? path.resolve(root, ios.xcodeproj) : findXcodeproj(iosDir);
  const projectName = xcodeproj ? path.basename(xcodeproj, '.xcodeproj') : undefined;
  const iosSourceDir = ios.sourceDir ? path.resolve(root, ios.sourceDir) : projectName ? path.join(iosDir, projectName) : undefined;
  const iosTarget = ios.target ?? projectName;
  const podfilePath = path.resolve(root, ios.podfile ?? 'ios/Podfile');
  const typescriptFile = path.resolve(root, config.typescript?.outputFile ?? 'src/agentActions.generated.ts');

  const kotlin = generateKotlin(schema);
  const swift = generateSwift(schema);
  const hasAndroid = fs.existsSync(path.join(root, 'android'));
  const hasIos = Boolean(xcodeproj && iosSourceDir);

  /** @type {Output[]} */
  const outputs = [{ file: typescriptFile, content: generateTypeScript(schema) }];
  if (hasAndroid) {
    outputs.push({ file: kotlinPath(androidSourceDir), content: kotlin });
    const manifest = readIfExists(manifestPath);
    if (manifest !== undefined) {
      outputs.push({ file: manifestPath, content: updateManifest(manifest, kotlin !== undefined) });
    }
  }
  const shortcutStrings = generateShortcutStrings(schema);
  const infoPlist = iosSourceDir ? path.resolve(root, ios.infoPlist ?? path.join(iosSourceDir, 'Info.plist')) : undefined;
  /** @type {string | undefined} */
  let infoPlistTodo;
  if (hasIos && iosSourceDir) {
    outputs.push({ file: path.join(iosSourceDir, SWIFT_FILE), content: swift });
    for (const [locale, content] of shortcutStrings) {
      outputs.push({ file: path.join(iosSourceDir, `${locale}.lproj`, SHORTCUTS_STRINGS_FILE), content });
    }
    // Remove phrase files this tool wrote for locales that are no longer in the config.
    for (const entry of fs.readdirSync(iosSourceDir)) {
      const locale = entry.endsWith('.lproj') ? entry.slice(0, -'.lproj'.length) : undefined;
      const file = path.join(iosSourceDir, entry, SHORTCUTS_STRINGS_FILE);
      if (locale && !shortcutStrings.has(locale) && readIfExists(file)?.startsWith(STRINGS_HEADER)) {
        outputs.push({ file, content: undefined });
      }
    }
    if (schema.appNames.length > 0 && infoPlist) {
      const plist = readIfExists(infoPlist);
      const updated = plist === undefined ? undefined : updateInfoPlist(plist, schema.appNames);
      if (updated !== undefined) {
        outputs.push({ file: infoPlist, content: updated });
      } else if (plist === undefined) {
        infoPlistTodo = `Info.plist not found at ${relative(infoPlist)}. Set ios.infoPlist in the config to add the Siri app names.`;
      } else {
        infoPlistTodo = `${relative(infoPlist)} is not an XML plist. Add INAlternativeAppNames to it by hand.`;
      }
    }
  }

  if (values.check) {
    const stale = staleOutputs(outputs);
    if (stale.length > 0) {
      fail(`Generated files are out of date: ${stale.map((output) => relative(output.file)).join(', ')}. Run react-native-agent-actions generate.`);
    }
    console.log('Generated files are up to date.');
    return;
  }

  for (const output of staleOutputs(outputs)) {
    if (output.content === undefined) {
      fs.rmSync(output.file, { force: true });
      console.log(`removed  ${relative(output.file)}`);
    } else {
      fs.mkdirSync(path.dirname(output.file), { recursive: true });
      fs.writeFileSync(output.file, output.content);
      console.log(`wrote    ${relative(output.file)}`);
    }
  }

  const todo = [];
  if (hasAndroid && kotlin !== undefined) {
    const appGradle = path.join(root, 'android/app/build.gradle');
    const rootGradle = path.join(root, 'android/build.gradle');
    const script = path.relative(path.dirname(appGradle), path.join(PACKAGE_ROOT, 'android/agent-actions.gradle'));
    const appGradleText = readIfExists(appGradle);
    const updatedApp = appGradleText === undefined ? undefined : updateAppBuildGradle(appGradleText, script);
    if (updatedApp) {
      fs.writeFileSync(appGradle, updatedApp);
      console.log(`updated  ${relative(appGradle)}`);
    } else if (appGradleText === undefined) {
      todo.push(`Apply ${script} from your app module's build.gradle.`);
    }
    const rootGradleText = readIfExists(rootGradle);
    if (rootGradleText !== undefined && !rootGradleText.includes('com.google.devtools.ksp')) {
      const updatedRoot = updateRootBuildGradle(rootGradleText);
      if (updatedRoot) {
        fs.writeFileSync(rootGradle, updatedRoot);
        console.log(`updated  ${relative(rootGradle)}`);
      } else {
        todo.push('Add the KSP Gradle plugin (com.google.devtools.ksp) to android/build.gradle.');
      }
    }
  }

  if (hasIos && swift !== undefined && xcodeproj && iosSourceDir && iosTarget) {
    try {
      const status = addFileToXcodeProject(xcodeproj, iosTarget, path.join(iosSourceDir, SWIFT_FILE));
      if (status === 'added') {
        console.log(`updated  ${relative(xcodeproj)}`);
      }
    } catch (error) {
      todo.push(/** @type {Error} */ (error).message);
    }
    try {
      const status = syncShortcutStrings(xcodeproj, iosTarget, iosSourceDir, [...shortcutStrings.keys()]);
      if (status === 'updated') {
        console.log(`updated  ${relative(xcodeproj)} (localized App Shortcut phrases)`);
      }
    } catch (error) {
      todo.push(/** @type {Error} */ (error).message);
    }
    if (infoPlistTodo) {
      todo.push(infoPlistTodo);
    }
    const clamped = schema.actions.filter((action) => action.ios && action.timeoutMs > IOS_MAX_TIMEOUT_MS);
    if (clamped.length > 0) {
      console.warn(`warning: iOS stops App Intents after 30 seconds, so the timeout of ${clamped.map((action) => action.name).join(', ')} is capped at ${IOS_MAX_TIMEOUT_MS} ms on iOS.`);
    }
  }

  // The native module depends on AgentActionsCore even when no action targets iOS.
  if (hasIos) {
    const podfile = readIfExists(podfilePath);
    if (podfile !== undefined) {
      try {
        const updated = updatePodfile(podfile, path.relative(path.dirname(podfilePath), path.join(PACKAGE_ROOT, 'ios', 'core')));
        if (updated) {
          fs.writeFileSync(podfilePath, updated);
          console.log(`updated  ${relative(podfilePath)} (run pod install)`);
        }
      } catch (error) {
        todo.push(/** @type {Error} */ (error).message);
      }
    }
  }

  for (const item of todo) {
    console.warn(`todo: ${item}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
