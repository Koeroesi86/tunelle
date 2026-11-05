const { execSync } = require('child_process')

const cache = require('../../config/cache')

process.env.ELECTRON_CACHE = process.env.ELECTRON_CACHE || cache.electron
process.env.ELECTRON_BUILDER_CACHE = process.env.ELECTRON_BUILDER_CACHE || cache.electronBuilder

const isWin = process.platform === 'win32'

console.log('Fixing compiled dependencies')
execSync(
  'electron-builder install-app-deps',
  {
    shell: true,
    env: Object.assign({}, process.env),
    stdio: 'inherit'
  }
)
