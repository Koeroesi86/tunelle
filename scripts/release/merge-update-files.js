const { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('fs')
const { basename, join, resolve } = require('path')

// usage: node scripts/release/merge-update-files.js <artifacts> <release>
// copies the files of every folder in <artifacts> (one per runner) to <release>; latest.yml and latest-mac.yml are written by the runner of each
// architecture of windows and macOS, but electron-updater reads one file per platform, so their lists of files are merged into one
// (linux has a file for each architecture, latest-linux.yml and latest-linux-arm64.yml)
const filesPattern = /^files:\n((?:[ -] .*\n?)+)/m
const entryPattern = /^ {2}- url: /m

const splitEntries = metadata => (metadata.match(filesPattern)?.[1] ?? '').split(entryPattern).slice(1).map(entry => `  - url: ${entry.trimEnd()}`)

const entryUrl = entry => entry.match(/^ {2}- url: (.+)$/m)[1].trim()

// the first file keeps its version, release date and the path and hash of its installer, the entries of the others are added
const mergeUpdateFiles = metadata => {
  const [first, ...others] = metadata
  const entries = [...splitEntries(first), ...others.flatMap(splitEntries)].filter((entry, index, all) => all.findIndex(other => entryUrl(other) === entryUrl(entry)) === index)
  const [, version] = first.match(/^version: (.+)$/m)
  others
    .filter(other => other.match(/^version: (.+)$/m)?.[1] !== version)
    .forEach(() => {
      throw new Error(`the update files do not have the same version ${version}`)
    })
  return first.replace(filesPattern, `files:\n${entries.join('\n')}\n`)
}

const listFiles = folder => readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(folder, entry.name))

const mergeArtifacts = (artifacts, release) => {
  const files = readdirSync(artifacts, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    // x64 comes first (dist-win32-x64 after dist-win32-arm64 in reverse), so the path of the merged file stays the installer it always was
    .sort()
    .reverse()
    .flatMap(name => listFiles(join(artifacts, name)))
  const updateFiles = files.filter(file => /^latest.*\.yml$/.test(basename(file)))
  mkdirSync(release, { recursive: true })
  files.filter(file => !updateFiles.includes(file)).forEach(file => copyFileSync(file, join(release, basename(file))))
  const names = [...new Set(updateFiles.map(file => basename(file)))]
  names.forEach(name =>
    writeFileSync(
      join(release, name),
      mergeUpdateFiles(updateFiles.filter(file => basename(file) === name).map(file => readFileSync(file, 'utf8')))
    )
  )
  return names
}

if (require.main === module) {
  const [artifacts, release] = process.argv.slice(2)
  if (!artifacts || !release) throw new Error('usage: node scripts/release/merge-update-files.js <artifacts> <release>')
  mergeArtifacts(resolve(artifacts), resolve(release)).forEach(name => console.log(`merged ${name}`))
}

module.exports = { mergeArtifacts, mergeUpdateFiles, splitEntries }
