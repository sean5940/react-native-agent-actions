import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { updateAppBuildGradle, updateManifest, updateRootBuildGradle } from '../integrate/android.mjs';
import { updateInfoPlist, updatePodfile } from '../integrate/ios.mjs';

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleName</key>
\t<string>Notey</string>
</dict>
</plist>
`;

describe('updateInfoPlist', () => {
  const names = [
    { name: '노트 앱', pronunciationHint: undefined },
    { name: 'Notes & More', pronunciationHint: 'notes and more' },
  ];

  it('adds the names with a pronunciation hint only when there is one', () => {
    const updated = updateInfoPlist(plist, names) ?? '';
    assert.ok(updated.endsWith(
      '\t<key>INAlternativeAppNames</key>\n\t<array>\n' +
        '\t\t<dict>\n\t\t\t<key>INAlternativeAppName</key>\n\t\t\t<string>노트 앱</string>\n\t\t</dict>\n' +
        '\t\t<dict>\n\t\t\t<key>INAlternativeAppName</key>\n\t\t\t<string>Notes &amp; More</string>\n' +
        '\t\t\t<key>INAlternativeAppNamePronunciationHint</key>\n\t\t\t<string>notes and more</string>\n\t\t</dict>\n' +
        '\t</array>\n</dict>\n</plist>\n'
    ));
    assert.equal(updateInfoPlist(updated, names), updated);
  });

  it('replaces the names already in the plist where they are', () => {
    const before = plist.replace('</dict>', '\t<key>INAlternativeAppNames</key>\n\t<array/>\n\t<key>UIStatusBarHidden</key>\n\t<true/>\n</dict>');
    const updated = updateInfoPlist(before, [names[0]]) ?? '';
    assert.match(updated, /<string>노트 앱<\/string>\n\t\t<\/dict>\n\t<\/array>\n\t<key>UIStatusBarHidden<\/key>/);
    assert.equal(updated.match(/INAlternativeAppNames/g)?.length, 1);
  });

  it('leaves binary plists alone', () => {
    assert.equal(updateInfoPlist('bplist00\u0000', names), undefined);
  });
});

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
