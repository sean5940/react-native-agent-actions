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
