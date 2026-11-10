const { writeFileSync } = require('fs')
const { join } = require('path')
const source = require('./ffmpeg-source.json')

const licenseFolder = '${FLATPAK_DEST}/share/licenses/${FLATPAK_ID}/ffmpeg'

// the flatpak-builder module below builds the decode-only ffmpeg from the pinned tarball, with the configure flags of ffmpeg-source.json (the one place they live)
const withoutExcluded = (flag, excluded) => {
  const [name, list] = flag.split('=')
  return list === undefined ? flag : `${name}=${list.split(',').filter(item => !excluded.includes(item)).join(',')}`
}

// the patent-heavy codecs of flatpakExcluded stay out of the Flathub build. See docs/development/ffmpeg-build.md
const flatpakModule = ({ url, sha256, configure, flatpakExcluded }) => ({
  name: 'ffmpeg',
  buildsystem: 'simple',
  'build-commands': [
    `./configure --prefix=\${FLATPAK_DEST} ${configure.map(flag => withoutExcluded(flag, flatpakExcluded ?? [])).join(' ')}`,
    'make -j${FLATPAK_BUILDER_N_JOBS}',
    'install -Dm755 ffmpeg ${FLATPAK_DEST}/ffmpeg/ffmpeg',
    `install -Dm644 COPYING.LGPLv2.1 ${licenseFolder}/COPYING.LGPLv2.1`,
    `install -Dm644 LICENSE.md ${licenseFolder}/LICENSE.md`
  ],
  sources: [{ type: 'archive', url, sha256 }]
})

const modulePath = join(__dirname, '..', '..', 'packaging', 'flatpak', 'ffmpeg-module.json')
const serialize = module => `${JSON.stringify(module, undefined, 2)}\n`

if (require.main === module) writeFileSync(modulePath, serialize(flatpakModule(source)))

module.exports = { flatpakModule, modulePath, serialize }
