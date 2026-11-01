const { listPackage, extractFile } = require('@electron/asar')
const { existsSync, readdirSync, readFileSync } = require('fs')
const { normalize, resolve } = require('path')
const { resourcesFolder, storePackage, updateMetadata } = require('./dist-layout')

// usage: node scripts/check-dist.js
// lists what the packaged app contains and fails on files that must not ship: secrets, source maps, tests and the sources of the app
// the update metadata that electron-updater reads from the release, and the installer it has to list
// the packaged app is the one of the architecture of the machine (see scripts/dist-layout.js)
const archive = resolve(__dirname, '..', resourcesFolder(process.platform, process.arch), 'app.asar')

const forbidden = [
  [/(^|\/)\.env(\.|$)/, 'environment file'],
  [/\.(pem|key|p12|pfx|crt)$/, 'key or certificate'],
  [/(^|\/)\.git(\/|$)/, 'git folder'],
  [/\.map$/, 'source map'],
  [/\.(test|spec)\.[jt]sx?$/, 'test'],
  [/^\/(electron|client|components|scripts|coverage|\.cache|\.claude|\.github)\//, 'source or tooling folder'],
  [/^\/(index|test-utils-style-stub)\.ts$/, 'source file']
]
// the required files, so that a changed glob in package.json can not silently drop them
const required = ['/package.json', '/out/index.js', '/out/electron/preload.js', '/out/electron/splashPreload.js', '/build/index.html', '/build/loading.html', '/migrations']

if (!existsSync(archive)) {
  console.error(`${archive} does not exist, run npm run dist first`)
  process.exit(1)
}

const files = listPackage(archive, { isPack: false }).map(file => file.replace(/\\/g, '/'))
const problems = [
  ...files.flatMap(file => forbidden.filter(([pattern]) => pattern.test(file)).map(([, label]) => `${label}: ${file}`)),
  ...required.filter(path => !files.some(file => file === path || file.startsWith(`${path}/`))).map(path => `missing: ${path}`)
]

// a font that is a JavaScript module (file-loader with esModule) fails to decode in the renderer, so the text falls back
files
  .filter(file => file.startsWith('/build/') && file.endsWith('.woff2'))
  .filter(file => extractFile(archive, normalize(file.slice(1))).subarray(0, 4).toString('latin1') !== 'wOF2')
  .forEach(file => problems.push(`not a woff2 font: ${file}`))

const [metadataPath, installer] = updateMetadata(process.platform, process.arch)
const metadataFile = resolve(__dirname, '..', metadataPath)
if (!existsSync(metadataFile)) problems.push(`missing: ${metadataPath}`)
else {
  const metadata = readFileSync(metadataFile, 'utf8')
  if (!installer.test(metadata)) problems.push(`${metadataPath} does not list ${installer}`)
  // the release workflow uploads the files as they are named here, and GitHub renames an asset with a space in its name,
  // so the updater would ask for a file that is not in the release
  const listed = [...metadata.matchAll(/^\s*(?:- )?url: (.+)$/gm)].map(([, name]) => name.trim())
  listed.filter(name => !existsSync(resolve(__dirname, '..', 'dist', name))).forEach(name => problems.push(`${metadataPath} lists ${name}, which is not in dist/`))
  listed.filter(name => !/^[\w.-]+$/.test(name)).forEach(name => problems.push(`${metadataPath} lists ${name}, which GitHub would rename`))
}
// the package of the Microsoft Store has to be built, and the updater must not be pointed to it: the Store updates it
const store = storePackage(process.platform, process.arch)
if (store && !readdirSync(resolve(__dirname, '..', 'dist')).some(name => store.test(name))) problems.push(`missing: a file in dist/ named like ${store}`)
if (store && existsSync(metadataFile) && /\.appx\b/.test(readFileSync(metadataFile, 'utf8'))) problems.push(`${metadataPath} lists the package of the Microsoft Store`)
// the packaged app must know where to look for updates, linux-unpacked is rebuilt by the flatpak build, which has none on purpose
if (process.platform !== 'linux' && !existsSync(resolve(archive, '..', 'app-update.yml'))) problems.push('missing: app-update.yml')

problems.slice(0, 50).forEach(problem => console.error(problem))
console.log(`${files.length} files in ${archive}, ${problems.length} problems`)
process.exit(problems.length ? 1 : 0)
