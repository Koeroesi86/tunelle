import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// the rules of .claude/rules/workflows.md that a script can check
const directory = __dirname;
const workflows = readdirSync(directory)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => [name, readFileSync(join(directory, name), 'utf8')]);
const read = (name: string) => {
  const found = workflows.find(([file]) => file === name);
  if (!found) throw new Error(`No workflow ${name}`);

  return found[1];
};

describe('workflows', () => {
  it.each(workflows)('%s skips no check to pass', (name, text) => {
    expect(text).not.toMatch(/continue-on-error|--no-verify/);
  });

  it.each(workflows)('%s sets permissions', (name, text) => {
    expect(text).toMatch(/^\s*permissions:/m);
  });

  it.each(workflows)('%s passes untrusted input through env', (name, text) => {
    const interpolated = text
      .split('\n')
      .filter((line) =>
        /\$\{\{\s*github\.(head_ref|event\.(pull_request\.(title|body|head\.ref)|head_commit\.message|issue\.(title|body)|comment\.body))/.test(line)
      )
      .filter((line) => !/^\s+[A-Z_]+: \$\{\{/.test(line));

    expect(interpolated).toEqual([]);
  });

  it.each(['test.yml', 'dist.yml'])('%s runs on Linux, macOS and Windows without fail-fast', (name) => {
    const text = read(name);

    expect(text).toMatch(/fail-fast: false/);
    expect(text).toMatch(/ubuntu/);
    expect(text).toMatch(/macos/);
    expect(text).toMatch(/windows/);
  });

  it('test.yml also runs the tests and the end to end tests on Ubuntu 22.04, the system the AppImage is built for', () => {
    const text = read('test.yml');

    expect(text).toMatch(/os: \[.*ubuntu-22\.04,/);
    expect(text).toMatch(/os: \[.*ubuntu-22\.04-arm,/);
    expect(text).toMatch(/startsWith\(matrix\.os, 'ubuntu-22\.04'\)[\s\S]*npm_config_build_from_source=true/);
  });

  it('test.yml runs the cheap checks first', () => {
    const text = read('test.yml');
    const order = ['npm run lint', 'npm run fallow', 'npm run typecheck', 'npm run test:coverage', 'npm run build', 'npm run test:e2e'].map((command) =>
      text.indexOf(command)
    );

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('test.yml runs the static checks once on Linux, beside the jobs of every system', () => {
    const text = read('test.yml');

    expect(text).toMatch(/\n  static:\n(?:.*\n)*?    runs-on: ubuntu-latest\n/);
    expect(text).not.toMatch(/needs: static/);
  });

  it('pr-checks.yml packages beside the tests, and required-checks needs both', () => {
    expect(read('pr-checks.yml')).not.toMatch(/\n  dist:\n\s+needs:/);
  });

  // appimage.github.io tests the AppImage on the oldest supported Ubuntu LTS: a native module built on a newer one needs a newer glibc (npm run check:dist)
  it('dist.yml builds the AppImage on Ubuntu 22.04 and the Flatpak on the latest', () => {
    const text = read('dist.yml');

    expect(text).toMatch(/- os: ubuntu-22\.04\n\s+platform: linux\n\s+arch: x64\n\s+package: appimage/);
    expect(text).toMatch(/- os: ubuntu-22\.04-arm\n\s+platform: linux\n\s+arch: arm64\n\s+package: appimage/);
    expect(text).toMatch(/- os: ubuntu-latest\n\s+platform: linux\n\s+arch: x64\n\s+package: flatpak/);
  });

  it('dist.yml makes the zsync file of the AppImage before the contents of the package are checked', () => {
    const text = read('dist.yml');
    const zsync = text.indexOf('node scripts/release/zsync.js');

    expect(zsync).toBeGreaterThan(text.indexOf('run: npm run dist'));
    expect(zsync).toBeLessThan(text.indexOf('run: npm run check:dist'));
    expect(text).toMatch(/if: matrix\.package == 'appimage'\n\s+run: \|\n\s+install\(\).*zsync/);
  });

  it('dist.yml packages the ffmpeg that ffmpeg.yml built for the system of the job, before npm run dist', () => {
    const text = read('dist.yml');
    const download = text.indexOf('name: ffmpeg-${{ matrix.platform }}-${{ matrix.arch }}');

    expect(text).toMatch(/\n  ffmpeg:\n\s+uses: \.\/\.github\/workflows\/ffmpeg\.yml/);
    expect(text).toMatch(/\n  dist:\n\s+needs: ffmpeg\n/);
    expect(download).toBeGreaterThan(0);
    expect(download).toBeLessThan(text.indexOf('run: npm run dist'));
    expect(read('ffmpeg.yml')).toMatch(/name: ffmpeg-\$\{\{ matrix\.platform \}\}-\$\{\{ matrix\.arch \}\}/);
  });

  it('test.yml keeps the report of the end to end tests', () => {
    const text = read('test.yml');

    expect(text).toMatch(/name: e2e-report-/);
    expect(text).toMatch(/playwright-report/);
  });

  it('dist.yml runs the certification of the Store package on the Windows x64 package it built', () => {
    const text = read('dist.yml');

    expect(text).toMatch(/needs: dist\n\s+uses: \.\/\.github\/workflows\/wack\.yml\n\s+with:\n\s+artifact: dist-win32-x64/);
  });

  it('dist.yml also installs and starts the arm64 Store package on an arm64 runner, which has no certification kit', () => {
    const job = read('dist.yml').split('\n  certification-arm64:\n')[1].split('\n\n')[0];

    expect(job).toContain('needs: dist');
    expect(job).toContain('uses: ./.github/workflows/wack.yml');
    expect(job).toContain('artifact: dist-win32-arm64');
    expect(job).toContain('arch: arm64');
  });

  it('wack.yml runs the kit only for the x64 package and the arm64 package on windows-11-arm', () => {
    const text = read('wack.yml');

    expect(text).toMatch(/runs-on: \$\{\{ inputs\.arch == 'arm64' && 'windows-11-arm' \|\| 'windows-2025' \}\}/);
    expect(text).toMatch(/- name: Run the Windows App Certification Kit\n\s+if: inputs\.arch != 'arm64'/);
    expect(text).toMatch(/- name: Install the package and watch for requests to GitHub\n\s+shell: pwsh/);
  });

  it('pages.yml signs the Flatpak repository with a secret and release.yml hands the secrets on', () => {
    expect(read('pages.yml')).toMatch(/FLATPAK_GPG_PRIVATE_KEY: \$\{\{ secrets\.FLATPAK_GPG_PRIVATE_KEY \}\}/);
    expect(read('release.yml')).toMatch(/uses: \.\/\.github\/workflows\/pages\.yml\n(?:\s+#.*\n)?\s+secrets: inherit/);
  });

  it('pages.yml builds the Flatpak repository into the site before it is uploaded', () => {
    const text = read('pages.yml');

    expect(text.indexOf('scripts/tooling/build-site.js')).toBeLessThan(text.indexOf('scripts/release/flatpak-repo.js flatpak-bundles _site/repo'));
    expect(text.indexOf('scripts/release/flatpak-repo.js flatpak-bundles _site/repo')).toBeLessThan(text.indexOf('upload-pages-artifact'));
  });

  it('pages.yml keeps the downloads of apt between runs, also after a failed install', () => {
    const text = read('pages.yml');

    expect(text.indexOf('actions/cache/restore')).toBeLessThan(text.indexOf('apt-get install'));
    expect(text.indexOf('apt-get install')).toBeLessThan(text.indexOf('actions/cache/save'));
    expect(text).toMatch(/Dir::Cache::archives="\$HOME\/apt-archives"/);
    expect(text).toMatch(/- name: Keep the packaging tools\n\s+if: always\(\)/);
    expect(text).not.toMatch(/\n\s+sudo apt-get update\n/);
  });

  it('dist.yml installs the app from the Flatpak repository it builds', () => {
    expect(read('dist.yml')).toMatch(/scripts\/release\/flatpak-repo\.js dist[\s\S]*flatpak install --user --noninteractive tunelle-test/);
  });

  it('dist.yml builds before it packages', () => {
    const text = read('dist.yml');

    expect(text.indexOf('npm run build')).toBeLessThan(text.indexOf('npm run dist'));
  });

  it('store.yml takes its secrets from the environment through env and decides before it downloads and submits', () => {
    const text = read('store.yml');
    const secretLines = text.split('\n').filter((line) => /secrets\./.test(line));

    expect(text).toMatch(/environment: microsoft-store/);
    expect(text).toMatch(/concurrency:\n  group: microsoft-store\n  cancel-in-progress: false/);
    expect(text).toMatch(/permissions:\n  contents: read\n/);
    expect(secretLines.length).toBeGreaterThan(0);
    expect(secretLines.filter((line) => !/^\s+[A-Z_]+: \$\{\{ secrets\.MS_STORE_[A-Z_]+ \}\}$/.test(line))).toEqual([]);
    expect(text).not.toMatch(/run:.*\$\{\{/);
    expect(text).not.toMatch(/\n  (?:push|pull_request|release):/);
    expect(text.indexOf('store-submission.js decide')).toBeLessThan(text.indexOf('gh release download'));
    expect(text.indexOf('store-submission.js check')).toBeLessThan(text.indexOf('msstore publish'));
    expect(text.indexOf('msstore submission publish')).toBeLessThan(text.indexOf('store-submission.js started'));
    expect(text.indexOf('store-submission.js started')).toBeLessThan(text.indexOf('Say what was submitted'));
  });

  it('store.yml runs from release.yml, by hand and weekly on Wednesday', () => {
    const text = read('store.yml');

    expect(text).toMatch(/on:\n  workflow_call:\n    inputs:\n      tag:[\s\S]*\n  workflow_dispatch:\n    inputs:\n      tag:/);
    expect(text).toMatch(/schedule:\n    - cron: '\d+ \d+ \* \* 3'/);
  });

  it('store.yml only takes a tag of a release into the environment of its steps', () => {
    expect(read('store.yml')).toMatch(/=~ \^v\[0-9\]\{2\}[\s\S]*>> "\$GITHUB_ENV"/);
  });

  it('store.yml makes only a draft in a manual run unless it is told to commit, and commits in an automatic one', () => {
    const text = read('store.yml');

    expect(text).toMatch(/workflow_dispatch:[\s\S]*commit:[\s\S]*default: false/);
    expect(text).toMatch(/COMMIT: \$\{\{ github\.event_name == 'schedule' \|\| inputs\.commit \}\}/);
    expect(text).toMatch(/msstore publish \$bundle --appId \$env:PRODUCT_ID --noCommit/);
    expect(text).toMatch(
      /- name: Submit the draft for certification\n\s+if: steps\.decide\.outputs\.submit == 'true' && env\.COMMIT == 'true'\n[\s\S]*msstore submission publish/
    );
    expect(text.indexOf('updateMetadata')).toBeLessThan(text.indexOf('msstore submission publish'));
  });

  it('release.yml submits what it released to the Store, after the release is published', () => {
    expect(read('release.yml')).toMatch(
      /\n  store:\n(?:\s+#.*\n)*\s+needs: \[plan, release\]\n\s+uses: \.\/\.github\/workflows\/store\.yml\n\s+with:\n\s+tag: v\$\{\{ needs\.plan\.outputs\.version \}\}\n\s+commit: true\n\s+automatic: true\n/
    );
  });

  it('release.yml uploads to a draft, checks its files and publishes it last, before the website and the Store', () => {
    const text = read('release.yml');

    expect(text).toMatch(/uses: softprops\/action-gh-release@[\s\S]*?\n\s+draft: true\n/);
    expect(text.indexOf('draft: true')).toBeLessThan(text.indexOf('Check that the draft has every file'));
    expect(text.indexOf('Check that the draft has every file')).toBeLessThan(text.indexOf('- name: Publish the release'));
    expect(text).toMatch(/- name: Publish the release[\s\S]*draft=false\n\n  # the website/);
    expect(text).toMatch(/\n  site:\n\s+needs: release\n/);
  });

  it('release.yml signs the macOS update file after the merge and before the upload, in the environment that holds the key', () => {
    const text = read('release.yml');

    expect(text).toMatch(/\n  release:\n[\s\S]*?\n    environment: release\n/);
    expect(text.indexOf('merge-update-files.js')).toBeLessThan(text.indexOf('update-signature.js sign dist/latest-mac.yml'));
    expect(text.indexOf('update-signature.js sign dist/latest-mac.yml')).toBeLessThan(text.indexOf('uses: softprops/action-gh-release'));
    expect(text).toContain('UPDATE_SIGNING_KEY: ${{ secrets.UPDATE_SIGNING_KEY }}');
  });

  it('dist.yml runs the update test of the macOS app after the smoke test of the packaged app', () => {
    const text = read('dist.yml');

    expect(text).toMatch(/- name: Update test of the packaged app \(macOS\)\n\s+if: runner\.os == 'macOS'\n[\s\S]*?run: npm run test:updater/);
    expect(text.indexOf('npm run smoke:packaged')).toBeLessThan(text.indexOf('npm run test:updater'));
  });

  it('pr-checks.yml runs the perf measurements, which master does not require', () => {
    const text = read('pr-checks.yml');

    expect(text).toMatch(/\n  perf:\n(?:\s+#.*\n)*\s+uses: \.\/\.github\/workflows\/perf\.yml\n/);
    expect(text).toMatch(/needs: \[test, audit, dist, security, codeql\]/);
  });

  it('perf.yml measures the base branch first with the scenarios of the pull request, and keeps both sets of numbers', () => {
    const text = read('perf.yml');

    expect(text).toMatch(/ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n\s+path: base/);
    expect(text.indexOf('Measure the base branch')).toBeLessThan(text.indexOf('- name: Measure\n'));
    expect(text).toMatch(/PERF_APP_OUT: \$\{\{ github\.workspace \}\}\/base\/out/);
    expect(text).toMatch(/name: base-perf-\$\{\{ matrix\.os \}\}/);
  });

  it('perf.yml runs every measurement three times, the base branch and the pull request alike, for the median of the summary', () => {
    expect(read('perf.yml').match(/PERF_REPEAT: 3\n/g)).toHaveLength(2);
  });
});
