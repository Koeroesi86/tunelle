import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'

// the rules of .claude/rules/workflows.md that a script can check
const directory = resolve(__dirname, '../.github/workflows')
const workflows = readdirSync(directory)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => [name, readFileSync(join(directory, name), 'utf8')])
const read = (name) => workflows.find(([file]) => file === name)[1]

describe('workflows', () => {
  it.each(workflows)('%s skips no check to pass', (name, text) => {
    expect(text).not.toMatch(/continue-on-error|--no-verify/)
  })

  it.each(workflows)('%s sets permissions', (name, text) => {
    expect(text).toMatch(/^\s*permissions:/m)
  })

  it.each(workflows)('%s passes untrusted input through env', (name, text) => {
    const interpolated = text
      .split('\n')
      .filter((line) => /\$\{\{\s*github\.(head_ref|event\.(pull_request\.(title|body|head\.ref)|head_commit\.message|issue\.(title|body)|comment\.body))/.test(line))
      .filter((line) => !/^\s+[A-Z_]+: \$\{\{/.test(line))

    expect(interpolated).toEqual([])
  })

  it.each(['test.yml', 'dist.yml'])('%s runs on Linux, macOS and Windows without fail-fast', (name) => {
    const text = read(name)

    expect(text).toMatch(/fail-fast: false/)
    expect(text).toMatch(/ubuntu/)
    expect(text).toMatch(/macos/)
    expect(text).toMatch(/windows/)
  })

  it('test.yml also runs the tests and the end to end tests on Ubuntu 22.04, the system the AppImage is built for', () => {
    const text = read('test.yml')

    expect(text).toMatch(/os: \[.*ubuntu-22\.04,/)
    expect(text).toMatch(/os: \[.*ubuntu-22\.04-arm,/)
    expect(text).toMatch(/startsWith\(matrix\.os, 'ubuntu-22\.04'\)[\s\S]*npm_config_build_from_source=true/)
  })

  it('test.yml runs the cheap checks first', () => {
    const text = read('test.yml')
    const order = ['npm run lint', 'npm run fallow', 'npm run typecheck', 'npm run test:coverage', 'npm run build', 'npm run test:e2e'].map((command) => text.indexOf(command))

    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('test.yml runs the checks of every system only after the static ones passed', () => {
    const text = read('test.yml')

    expect(text).toMatch(/\n  static:\n(?:.*\n)*?    runs-on: ubuntu-latest\n/)
    expect(text).toMatch(/\n  test:\n(?:.*\n)*?    needs: static\n/)
  })

  // appimage.github.io tests the AppImage on the oldest supported Ubuntu LTS: a native module built on a newer one needs a newer glibc (npm run check:dist)
  it('dist.yml builds the AppImage on Ubuntu 22.04 and the Flatpak on the latest', () => {
    const text = read('dist.yml')

    expect(text).toMatch(/- os: ubuntu-22\.04\n\s+platform: linux\n\s+arch: x64\n\s+package: appimage/)
    expect(text).toMatch(/- os: ubuntu-22\.04-arm\n\s+platform: linux\n\s+arch: arm64\n\s+package: appimage/)
    expect(text).toMatch(/- os: ubuntu-latest\n\s+platform: linux\n\s+arch: x64\n\s+package: flatpak/)
  })

  it('test.yml keeps the report of the end to end tests', () => {
    const text = read('test.yml')

    expect(text).toMatch(/name: e2e-report-/)
    expect(text).toMatch(/playwright-report/)
  })

  it('dist.yml runs the certification of the Store package on the Windows x64 package it built', () => {
    const text = read('dist.yml')

    expect(text).toMatch(/needs: dist\n\s+uses: \.\/\.github\/workflows\/wack\.yml\n\s+with:\n\s+artifact: dist-win32-x64/)
  })

  it('pages.yml signs the Flatpak repository with a secret and release.yml hands the secrets on', () => {
    expect(read('pages.yml')).toMatch(/FLATPAK_GPG_PRIVATE_KEY: \$\{\{ secrets\.FLATPAK_GPG_PRIVATE_KEY \}\}/)
    expect(read('release.yml')).toMatch(/uses: \.\/\.github\/workflows\/pages\.yml\n(?:\s+#.*\n)?\s+secrets: inherit/)
  })

  it('pages.yml builds the Flatpak repository into the site before it is uploaded', () => {
    const text = read('pages.yml')

    expect(text.indexOf('scripts/build-site.js')).toBeLessThan(text.indexOf('scripts/flatpak-repo.js flatpak-bundles _site/repo'))
    expect(text.indexOf('scripts/flatpak-repo.js flatpak-bundles _site/repo')).toBeLessThan(text.indexOf('upload-pages-artifact'))
  })

  it('dist.yml installs the app from the Flatpak repository it builds', () => {
    expect(read('dist.yml')).toMatch(/scripts\/flatpak-repo\.js dist[\s\S]*flatpak install --user --noninteractive tunelle-test/)
  })

  it('dist.yml builds before it packages', () => {
    const text = read('dist.yml')

    expect(text.indexOf('npm run build')).toBeLessThan(text.indexOf('npm run dist'))
  })
})
