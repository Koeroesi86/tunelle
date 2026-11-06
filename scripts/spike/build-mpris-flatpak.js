const { resolve } = require('path')
const cache = require('../tooling/config/cache')

process.env.ELECTRON_CACHE = process.env.ELECTRON_CACHE || cache.electron
process.env.ELECTRON_BUILDER_CACHE = process.env.ELECTRON_BUILDER_CACHE || cache.electronBuilder

// usage: node scripts/spike/build-mpris-flatpak.js (after npm run build), see docs/development/mpris-spike.md
// builds a Flatpak of its own id, so it installs beside the real app without touching its files or data, and with the finish arg of the target of #258:
// the name of the app id instead of org.mpris.MediaPlayer2.chromium.*
const appId = 'io.github.koeroesi86.TunelleSpike'
const { mkdirSync, writeFileSync } = require('fs')
const { build } = require('electron-builder')
const { build: base } = require('../../package.json')

// electron-builder concatenates arrays of an object passed as the config with those of package.json, which would keep the chromium.* arg,
// so the whole configuration goes in as a file of its own
const output = resolve(__dirname, '../../dist/mpris-spike')
const configFile = resolve(output, 'config.json')
const config = {
  ...base,
  appId,
  productName: 'Tunelle Spike',
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
