const { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('fs')
const { join, resolve } = require('path')
const { renderPages } = require('./site-pages')

// usage: node scripts/tooling/build-site.js <release.json> <out folder>
// copies site/ to the out folder and writes the pages of every language (scripts/tooling/site-pages.js) with the latest release: the version, the installer of each system and the titles of the
// changes (release.json is the answer of `gh api repos/<owner>/<repo>/releases/latest`), so the page needs no script to know the release
// {{version}}, {{notes}} and {{asset:<system>-<arch>}} are the placeholders; a system without an installer links to the page of the latest release
const releasesUrl = 'https://github.com/Koeroesi86/tunelle/releases/latest'
const maxNotes = 6

// the installer of a system, from the name of the asset: x64 is the one that has no architecture in its name (macOS) or one of several spellings (Linux)
const installers = [
  ['windows', /\.exe$/],
  ['mac', /\.dmg$/],
  ['linux', /\.AppImage$/],
]
const architecture = (name) => (/arm64|aarch64/i.test(name) ? 'arm64' : 'x64')

const findAssets = (assets) =>
  Object.fromEntries(
    assets
      .flatMap(({ name, browser_download_url: url }) => installers.filter(([, pattern]) => pattern.test(name)).map(([system]) => [`${system}-${architecture(name)}`, url]))
      .reverse()
  )

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// "* Title by @user in https://github.com/.../pull/1" of the generated release notes, without the author and the link
const findNotes = (body = '') =>
  body
    .split(/\r?\n/)
    .filter((line) => /^\s*[*-] /.test(line))
    .map((line) => line.replace(/^\s*[*-] /, '').replace(/ by @\S+ in \S+$/, '').trim())
    .filter((note) => note && !/^Full Changelog/i.test(note))
    .slice(0, maxNotes)

const stampSite = (html, release) => {
  const assets = findAssets(release.assets ?? [])
  const notes = findNotes(release.body)

  return html
    .replace(/\{\{version\}\}/g, escapeHtml(String(release.tag_name ?? '').replace(/^v/, '')))
    .replace(/\{\{notes\}\}/g, notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('\n          '))
    .replace(/\{\{asset:([\w-]+)\}\}/g, (_, key) => escapeHtml(assets[key] ?? releasesUrl))
}

// the templates and the strings are the source of the pages, not part of the site
const sources = ['templates', 'strings']

const copyFolder = (from, to, skip = []) => {
  mkdirSync(to, { recursive: true })
  readdirSync(from, { withFileTypes: true })
    .filter((entry) => !skip.includes(entry.name))
    .forEach((entry) => (entry.isDirectory() ? copyFolder(join(from, entry.name), join(to, entry.name)) : copyFileSync(join(from, entry.name), join(to, entry.name))))
}

const buildSite = (releasePath, outPath) => {
  const release = JSON.parse(readFileSync(releasePath, 'utf8'))
  const source = resolve(__dirname, '../..', 'site')

  rmSync(outPath, { recursive: true, force: true })
  copyFolder(source, outPath, sources)
  renderPages().forEach(([path, html]) => {
    mkdirSync(join(outPath, path, '..'), { recursive: true })
    writeFileSync(join(outPath, path), stampSite(html, release))
  })
}

if (require.main === module) {
  const [releasePath, outPath] = process.argv.slice(2)
  if (!releasePath || !outPath) {
    console.error('usage: node scripts/tooling/build-site.js <release.json> <out folder>')
    process.exit(1)
  }
  buildSite(releasePath, outPath)
}

module.exports = { architecture, buildSite, findAssets, findNotes, stampSite }
