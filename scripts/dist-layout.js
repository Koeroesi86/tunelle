// where electron-builder puts the unpacked app and its update metadata: the folders and the metadata of linux are named after the architecture, except for x64
// (win-unpacked, mac, latest-linux.yml), the other architectures get a suffix (win-arm64-unpacked, mac-arm64, latest-linux-arm64.yml)
const unpackedFolders = {
  linux: arch => (arch === 'x64' ? 'linux-unpacked' : `linux-${arch}-unpacked`),
  darwin: arch => (arch === 'x64' ? 'mac' : `mac-${arch}`),
  win32: arch => (arch === 'x64' ? 'win-unpacked' : `win-${arch}-unpacked`)
}
const executables = {
  linux: 'Tunelle',
  darwin: 'Tunelle.app/Contents/MacOS/Tunelle',
  win32: 'Tunelle.exe'
}
const resources = {
  linux: 'resources',
  darwin: 'Tunelle.app/Contents/Resources',
  win32: 'resources'
}

const unpackedFolder = (platform, arch) => `dist/${unpackedFolders[platform](arch)}`

const packagedExecutable = (platform, arch) => `${unpackedFolder(platform, arch)}/${executables[platform]}`

const resourcesFolder = (platform, arch) => `${unpackedFolder(platform, arch)}/${resources[platform]}`

// the update metadata that electron-updater reads from the release, and the installer it has to list; windows and macOS share one file between the
// architectures (the release workflow merges them with scripts/merge-update-files.js), only linux has a file for each
const updateMetadata = (platform, arch) =>
  ({
    linux: [arch === 'x64' ? 'dist/latest-linux.yml' : `dist/latest-linux-${arch}.yml`, /\.AppImage\b/],
    darwin: ['dist/latest-mac.yml', /\.zip\b/],
    win32: ['dist/latest.yml', /\.exe\b/]
  })[platform]

module.exports = { packagedExecutable, resourcesFolder, unpackedFolder, updateMetadata }
