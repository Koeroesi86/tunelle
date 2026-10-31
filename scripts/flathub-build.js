const { execFileSync } = require('child_process')
const { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('fs')
const { dirname, join } = require('path')
const { build } = require('../package.json')
const { unpackedFolder } = require('./dist-layout')

// usage: node scripts/flathub-build.js <prefix>     (in the Flatpak <prefix> is /app)
// builds the app from the checkout of a release tag without a network, and installs it, the desktop entry, the metainfo and the icons under <prefix>
// the version and the date of the release are the ones of the tag: the app reports the version, and the metainfo lists the release
// the environment is the one flatpak-builder sets up: FLATPAK_ARCH, and XDG_CACHE_HOME with the electron zip and the node headers from the sources that
// flatpak-node-generator writes; npm reads the packages from its own cache (npm_config_cache, npm_config_offline)
const architectures = { x86_64: { node: 'x64', builder: '--x64' }, aarch64: { node: 'arm64', builder: '--arm64' } }
const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512]
const releasePattern = /<release version="[^"]*" date="[^"]*"\/>/
const metainfoPath = `flatpak/${build.appId}.metainfo.xml`

const run = (command, args, options) => execFileSync(command, args, { stdio: 'inherit', ...options })

const output = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim()

const requireEnv = name => {
  if (!process.env[name]) throw new Error(`${name} is not set`)
  return process.env[name]
}

const versionOfTag = tag => tag.replace(/^v/, '')

const stampRelease = (metainfo, version, date) => {
  if (!releasePattern.test(metainfo)) throw new Error('the metainfo has no <release> entry to stamp')
  return metainfo.replace(releasePattern, `<release version="${version}" date="${date}"/>`)
}

const architectureOf = flatpakArch => {
  if (!architectures[flatpakArch]) throw new Error(`${flatpakArch} is not an architecture of this build (${Object.keys(architectures).join(', ')})`)
  return architectures[flatpakArch]
}

// zypak sets the sandbox of Chromium up; the temporary folder is one inside the runtime folder of the app, as /tmp is not shared with the desktop
const wrapperScript = prefix =>
  ['#!/bin/sh', 'export TMPDIR="$XDG_RUNTIME_DIR/app/$FLATPAK_ID"', 'mkdir -p "$TMPDIR"', `exec zypak-wrapper ${prefix}/lib/tunelle/Tunelle --ozone-platform-hint=auto "$@"`, ''].join('\n')

const install = (from, to) => {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  chmodSync(to, 0o644)
}

const main = prefix => {
  process.chdir(join(__dirname, '..'))
  const cache = requireEnv('XDG_CACHE_HOME')
  const { node: arch, builder } = architectureOf(requireEnv('FLATPAK_ARCH'))
  const version = versionOfTag(output('git', ['describe', '--tags', '--exact-match']))

  run('node', ['scripts/version.js', version])
  writeFileSync(metainfoPath, stampRelease(readFileSync(metainfoPath, 'utf8'), version, output('git', ['log', '-1', '--format=%cs'])))
  run('npm', ['ci', '--offline', '--ignore-scripts'])

  // the scripts of npm ci are skipped, as they download: sqlite3 is compiled for electron from the headers in the cache
  const electron = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')).version
  run('npx', ['--offline', 'node-gyp', 'rebuild', '--runtime=electron', `--target=${electron}`, `--nodedir=${join(cache, 'node-gyp', electron)}`], { cwd: 'node_modules/sqlite3' })
  run('npm', ['run', 'build'])
  run('unzip', ['-q', join(cache, 'electron', `electron-v${electron}-linux-${arch}.zip`), '-d', 'electron-dist'])
  run('npx', ['electron-builder', '--linux', '--dir', builder, '--publish', 'never', '-c.electronDist=electron-dist', `-c.electronVersion=${electron}`, '-c.npmRebuild=false'])

  mkdirSync(`${prefix}/lib/tunelle`, { recursive: true })
  run('cp', ['-a', `${unpackedFolder('linux', arch)}/.`, `${prefix}/lib/tunelle`])
  mkdirSync(`${prefix}/bin`, { recursive: true })
  writeFileSync(`${prefix}/bin/Tunelle`, wrapperScript(prefix), { mode: 0o755 })
  install(`flatpak/${build.appId}.desktop`, `${prefix}/share/applications/${build.appId}.desktop`)
  install(metainfoPath, `${prefix}/share/metainfo/${build.appId}.metainfo.xml`)
  iconSizes.forEach(size => install(`icons/png/${size}x${size}.png`, `${prefix}/share/icons/hicolor/${size}x${size}/apps/${build.appId}.png`))
}

if (require.main === module) {
  const [prefix] = process.argv.slice(2)
  if (!prefix) throw new Error('usage: node scripts/flathub-build.js <prefix>')
  main(prefix)
}

module.exports = { architectureOf, stampRelease, versionOfTag, wrapperScript }
