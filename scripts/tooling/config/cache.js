const { join, resolve } = require('path')

// One folder per OS and per tool, so a cache restored from another machine never mixes platforms.
const root = process.env.BUILD_CACHE_ROOT || resolve(__dirname, '../../../.cache')

const cacheDir = tool => join(root, process.platform, tool)

module.exports = {
  electron: cacheDir('electron'),
  electronBuilder: cacheDir('electron-builder'),
  webpack: cacheDir('webpack'),
  tsc: cacheDir('tsc')
}
