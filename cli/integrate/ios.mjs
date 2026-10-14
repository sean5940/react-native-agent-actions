// @ts-check
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MARKER = '# react-native-agent-actions';

/**
 * Finds the app's Xcode project in `iosDir`.
 * @param {string} iosDir
 * @returns {string | undefined}
 */
export function findXcodeproj(iosDir) {
  if (!fs.existsSync(iosDir)) {
    return undefined;
  }
  const projects = fs.readdirSync(iosDir).filter((name) => name.endsWith('.xcodeproj') && name !== 'Pods.xcodeproj');
  if (projects.length > 1) {
    throw new Error(`Found ${projects.length} Xcode projects in ${iosDir}. Set ios.xcodeproj in the config.`);
  }
  return projects[0] === undefined ? undefined : path.join(iosDir, projects[0]);
}

/**
 * Adds the `AgentActionsCore` pod to the app target.
 * @param {string} podfile
 * @param {string} packagePath Path of the package relative to the Podfile directory.
 * @returns {string | undefined} The updated Podfile, or undefined when the pod is already there.
 */
export function updatePodfile(podfile, packagePath) {
  if (podfile.includes("pod 'AgentActionsCore'") || podfile.includes('pod "AgentActionsCore"')) {
    return undefined;
  }
  const match = podfile.match(/^([ \t]*)[^\n]*use_native_modules![^\n]*\n/m);
  if (!match || match.index === undefined) {
    throw new Error('Could not find use_native_modules! in the Podfile. Add pod \'AgentActionsCore\' to your app target by hand.');
  }
  const indent = match[1] ?? '';
  const insertAt = match.index + match[0].length;
  const line = `${indent}pod 'AgentActionsCore', :path => '${packagePath.split(path.sep).join('/')}' ${MARKER}\n`;
  return podfile.slice(0, insertAt) + line + podfile.slice(insertAt);
}

const ADD_FILE_SCRIPT = `
require 'xcodeproj'
project_path, target_name, file_path = ARGV
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == target_name }
abort("No target named #{target_name} in #{project_path}") unless target
absolute = File.expand_path(file_path)
existing = project.files.find { |f| f.real_path.to_s == absolute }
if existing
  if target.source_build_phase.files_references.include?(existing)
    puts 'unchanged'
    exit 0
  end
  ref = existing
else
  dir = File.dirname(absolute)
  group = project.main_group.recursive_children.find { |g| g.is_a?(Xcodeproj::Project::Object::PBXGroup) && g.real_path.to_s == dir }
  if group
    ref = group.new_reference(File.basename(absolute))
  else
    ref = project.main_group.new_reference(absolute)
    ref.set_source_tree('SOURCE_ROOT')
    ref.set_path(Pathname.new(absolute).relative_path_from(Pathname.new(File.dirname(project_path))).to_s)
  end
end
target.source_build_phase.add_file_reference(ref)
project.save
puts 'added'
`;

const SYNC_STRINGS_SCRIPT = `
require 'xcodeproj'
require 'pathname'
project_path, target_name, source_dir, locales_csv = ARGV
locales = locales_csv.to_s.split(',').reject(&:empty?)
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == target_name }
abort("No target named #{target_name} in #{project_path}") unless target
dir = File.expand_path(source_dir)
group = project.main_group.recursive_children.find { |g| g.instance_of?(Xcodeproj::Project::Object::PBXGroup) && g.real_path.to_s == dir } || project.main_group
variant = project.objects.find { |o| o.isa == 'PBXVariantGroup' && o.name == 'AppShortcuts.strings' }
changed = false
if locales.empty?
  if variant
    target.resources_build_phase.files.select { |f| f.file_ref == variant }.each(&:remove_from_project)
    variant.children.dup.each(&:remove_from_project)
    variant.remove_from_project
    changed = true
  end
else
  unless variant
    variant = group.new_variant_group('AppShortcuts.strings')
    changed = true
  end
  variant.children.dup.each do |child|
    next if locales.include?(child.name)
    child.remove_from_project
    changed = true
  end
  base = Pathname.new(variant.parent.real_path)
  (locales - variant.children.map(&:name)).each do |locale|
    file = Pathname.new(File.join(dir, "#{locale}.lproj", 'AppShortcuts.strings'))
    ref = variant.new_reference(file.relative_path_from(base).to_s)
    ref.name = locale
    ref.last_known_file_type = 'text.plist.strings'
    changed = true
  end
  unless target.resources_build_phase.files_references.include?(variant)
    target.resources_build_phase.add_file_reference(variant)
    changed = true
  end
  regions = project.root_object.known_regions
  locales.each do |locale|
    next if regions.include?(locale)
    regions << locale
    changed = true
  end
end
project.save if changed
puts(changed ? 'updated' : 'unchanged')
`;

/**
 * Makes the app target bundle exactly the given locales' `AppShortcuts.strings` as one localized resource.
 * @param {string} xcodeproj
 * @param {string} target
 * @param {string} sourceDir
 * @param {string[]} locales
 * @returns {'updated' | 'unchanged'}
 */
export function syncShortcutStrings(xcodeproj, target, sourceDir, locales) {
  const result = spawnSync('ruby', ['-e', SYNC_STRINGS_SCRIPT, xcodeproj, target, sourceDir, locales.join(',')], { encoding: 'utf8' });
  if (result.status !== 0) {
    const reason = (result.stderr || result.error?.message || '').trim();
    throw new Error(`Could not add the localized App Shortcut phrases to the ${target} target (${reason}). Add the .lproj/AppShortcuts.strings files in Xcode by hand.`);
  }
  return result.stdout.trim() === 'unchanged' ? 'unchanged' : 'updated';
}

/**
 * `INAlternativeAppNames` entries for the Info.plist.
 * @param {import('../schema.mjs').AppName[]} appNames
 */
export function alternativeAppNames(appNames) {
  return appNames.map((entry) =>
    entry.pronunciationHint
      ? { INAlternativeAppName: entry.name, INAlternativeAppNamePronunciationHint: entry.pronunciationHint }
      : { INAlternativeAppName: entry.name }
  );
}

/**
 * @param {string} plist
 * @returns {unknown} The current `INAlternativeAppNames`, or undefined when the key is missing.
 */
export function readAlternativeAppNames(plist) {
  const result = spawnSync('plutil', ['-extract', 'INAlternativeAppNames', 'json', '-o', '-', plist], { encoding: 'utf8' });
  return result.status === 0 ? JSON.parse(result.stdout) : undefined;
}

/**
 * @param {string} plist
 * @param {unknown} names
 */
export function writeAlternativeAppNames(plist, names) {
  const result = spawnSync('plutil', ['-replace', 'INAlternativeAppNames', '-json', JSON.stringify(names), plist], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Could not write INAlternativeAppNames to ${plist}: ${(result.stderr || '').trim()}`);
  }
}

/**
 * Adds the generated Swift file to the app target using the xcodeproj gem that ships with CocoaPods.
 * @param {string} xcodeproj
 * @param {string} target
 * @param {string} swiftFile
 * @returns {'added' | 'unchanged'}
 */
export function addFileToXcodeProject(xcodeproj, target, swiftFile) {
  const result = spawnSync('ruby', ['-e', ADD_FILE_SCRIPT, xcodeproj, target, swiftFile], { encoding: 'utf8' });
  if (result.status !== 0) {
    const reason = (result.stderr || result.error?.message || '').trim();
    throw new Error(`Could not add ${path.basename(swiftFile)} to the ${target} target (${reason}). Add it in Xcode by hand.`);
  }
  return result.stdout.trim() === 'unchanged' ? 'unchanged' : 'added';
}
