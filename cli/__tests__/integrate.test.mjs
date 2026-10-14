import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { updateAppBuildGradle, updateManifest, updateRootBuildGradle } from '../integrate/android.mjs';
import { updatePodfile } from '../integrate/ios.mjs';

const manifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:name=".MainApplication">
      <activity android:name=".MainActivity" />
    </application>
</manifest>
`;

describe('updateManifest', () => {
  it('adds the service once and removes it when disabled', () => {
    const added = updateManifest(manifest, true);
    assert.match(added, /android:name="dev\.agentactions\.generated\.AgentActionsService"/);
    assert.match(added, /android:value="agent_actions\.xml"/);
    assert.ok(added.indexOf('react-native-agent-actions:end') < added.indexOf('</application>'));
    assert.equal(updateManifest(added, true), added);
    assert.equal(updateManifest(added, false), manifest);
  });
});

describe('Gradle updates', () => {
  it('applies the helper script once', () => {
    const updated = updateAppBuildGradle('android {\n}\n', '../../node_modules/react-native-agent-actions/android/agent-actions.gradle');
    assert.match(updated ?? '', /apply from: file\("\.\.\/\.\.\/node_modules\/react-native-agent-actions\/android\/agent-actions\.gradle"\)/);
    assert.equal(updateAppBuildGradle(updated ?? '', 'x'), undefined);
  });

  it('adds the KSP plugin next to the Kotlin plugin', () => {
    const root = 'buildscript {\n    dependencies {\n        classpath("com.android.tools.build:gradle")\n        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")\n    }\n}\n';
    const updated = updateRootBuildGradle(root) ?? '';
    assert.match(updated, /kotlin-gradle-plugin"\)\n {8}classpath\("com\.google\.devtools\.ksp:symbol-processing-gradle-plugin:[\d.]+"\)/);
    assert.equal(updateRootBuildGradle(updated), undefined);
    assert.equal(updateRootBuildGradle('buildscript {}\n'), undefined);
  });
});

describe('updatePodfile', () => {
  it('adds AgentActionsCore after use_native_modules!', () => {
    const podfile = "target 'App' do\n  config = use_native_modules!\n\n  use_react_native!()\nend\n";
    const updated = updatePodfile(podfile, '../node_modules/react-native-agent-actions') ?? '';
    assert.match(updated, /config = use_native_modules!\n {2}pod 'AgentActionsCore', :path => '\.\.\/node_modules\/react-native-agent-actions'/);
    assert.equal(updatePodfile(updated, 'x'), undefined);
    assert.throws(() => updatePodfile("target 'App' do\nend\n", 'x'), /use_native_modules!/);
  });
});
