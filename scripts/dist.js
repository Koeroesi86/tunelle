const { join, relative, resolve } = require('path')
const os = require('os')
const rimraf = require('rimraf')
const fs = require('fs')
const cache = require('../config/cache')
const { buildsAppImage, linuxBuilds } = require('./dist-layout')
const { embedUpdateInformation, updateInformation } = require('./appimage-update-info')

process.env.ELECTRON_CACHE = process.env.ELECTRON_CACHE || cache.electron
process.env.ELECTRON_BUILDER_CACHE = process.env.ELECTRON_BUILDER_CACHE || cache.electronBuilder

const electronBuilder = require('electron-builder')

const cwd = resolve(__dirname, '../')

console.log('Packaging started...')

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'

// process.env.DEBUG = 'electron-builder' // TODO: find another way to log
// process.env.NODE_OPTIONS = '--max-old-space-size=2048'

const distPath = resolve(cwd, './dist')
if (fs.existsSync(distPath)) {
  rimraf.sync(distPath)
  console.log('Removed previous build.')
}

const platforms = [
  [isWin, 'win', 'Windows'],
  [isMac, 'mac', 'Mac OS'],
  [isLinux, 'linux', 'Linux']
]

const builds = {
  win: [{ win: [] }],
  mac: [{ mac: [] }],
  linux: linuxBuilds(process.env.TUNELLE_LINUX_PACKAGE)
}

// the runtime of the AppImage carries the update information that AppImageUpdate and appimageupdatetool (which AM runs) read; electron-builder takes the runtime from the
// toolset of APPIMAGE_TOOLS_PATH when it is set, and hashes the AppImage only after the runtime is in it, so the hash and the blockmap of the update metadata fit the file
const prepareAppImageTools = async () => {
  const { getAppImageTools } = require('app-builder-lib/out/toolsets/linux')
  const { Arch } = require('builder-util')
  const tools = await getAppImageTools(require('../package.json').build.toolsets.appimage, Arch[process.arch])
  const folder = resolve(tools.mksquashfs, '..')
  const copy = fs.mkdtempSync(join(os.tmpdir(), 'tunelle-appimage-tools-'))
  fs.cpSync(folder, copy, { recursive: true, verbatimSymlinks: true })
  const runtime = resolve(copy, relative(folder, tools.runtime))
  fs.writeFileSync(runtime, embedUpdateInformation(fs.readFileSync(runtime), updateInformation(process.arch)))
  process.env.APPIMAGE_TOOLS_PATH = copy
}

// the release workflow uploads the files, electron-builder only writes the update metadata next to them
// the architecture of the machine is passed on (x64: true, arm64: true): with an empty list of targets electron-builder takes it from the configuration, which is x64
const build = options => electronBuilder.build({ ...options, [process.arch]: true, publish: 'never' })

platforms
  .filter(([enabled]) => enabled)
  .forEach(([, option, label]) => {
    // an empty target list makes electron-builder use the targets from package.json
    const prepare = option === 'linux' && buildsAppImage(process.env.TUNELLE_LINUX_PACKAGE) ? prepareAppImageTools() : Promise.resolve()

    builds[option]
      .reduce((previous, options) => previous.then(() => build(options)), prepare)
      .then(() => {
        console.log(`${label} package created.`)
        process.exit(0)
      })
      .catch(error => {
        console.error(error)
        process.exit(1)
      })
  })
