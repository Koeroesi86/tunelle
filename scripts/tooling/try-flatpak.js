const { mkdirSync, writeFileSync } = require('fs')
const { resolve } = require('path')
const cache = require('./config/cache')

process.env.ELECTRON_CACHE = process.env.ELECTRON_CACHE || cache.electron
process.env.ELECTRON_BUILDER_CACHE = process.env.ELECTRON_BUILDER_CACHE || cache.electronBuilder

// usage: node scripts/tooling/try-flatpak.js (after npm run build), see docs/development/try-flatpak.md
// builds a Flatpak of an id of its own (io.github.koeroesi86.TunelleTry) from the current code, so it installs beside the real app without touching its files or data
const appId = 'io.github.koeroesi86.TunelleTry'
const { build } = require('electron-builder')
const { build: base } = require('../../package.json')

// electron-builder concatenates arrays of an object passed as the config with those of package.json, which would keep the name of the real id,
// so the whole configuration goes in as a file of its own
const output = resolve(__dirname, '../../dist/try-flatpak')
const configFile = resolve(output, 'config.json')
const config = {
  ...base,
  appId,
  productName: 'Tunelle Try',
  publish: null,
  directories: { ...base.directories, output },
  flatpak: {
    ...base.flatpak,
    files: [],
    finishArgs: [...base.flatpak.finishArgs.filter(arg => !arg.startsWith('--own-name=')), `--own-name=org.mpris.MediaPlayer2.${appId}`]
  }
}

mkdirSync(output, { recursive: true })
writeFileSync(configFile, JSON.stringify(config, undefined, 2))

build({ linux: ['flatpak'], [process.arch]: true, publish: 'never', config: configFile }).then(files => console.log(files.join('\n')), error => {
  console.error(error)
  process.exitCode = 1
})
