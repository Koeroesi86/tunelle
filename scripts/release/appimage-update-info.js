// the update information of an AppImage: the runtime has a section of 1024 bytes for it (.upd_info) that AppImageUpdate and appimageupdatetool (which AM runs) read,
// and appimagetool -u writes; electron-builder does not, so it is written into the runtime before electron-builder puts it into the AppImage (scripts/release/dist.js)
const sectionName = '.upd_info'

// the names of the AppImages in the release (Tunelle-<version>-x86_64.AppImage, see artifactName in package.json)
const architectures = { x64: 'x86_64', arm64: 'arm64' }

// "gh-releases-zsync|user|repository|release|zsync file": the zsync file of the latest release, named like the AppImage with the version as the wildcard
const updateInformation = arch => {
  if (!architectures[arch]) throw new Error(`No update information for the architecture ${arch}`)

  return `gh-releases-zsync|Koeroesi86|tunelle|latest|Tunelle-*-${architectures[arch]}.AppImage.zsync`
}

// the section of the file as { offset, size }, undefined when there is none; the AppImage starts with its runtime, so the section table is found in it as well
const findSection = (elf, name) => {
  if (elf.toString('latin1', 0, 4) !== '\x7fELF' || elf[4] !== 2 || elf[5] !== 1) throw new Error('Not a 64 bit little endian ELF file')

  const tableOffset = Number(elf.readBigUInt64LE(0x28))
  const entrySize = elf.readUInt16LE(0x3a)
  const count = elf.readUInt16LE(0x3c)
  const namesIndex = elf.readUInt16LE(0x3e)
  const header = index => {
    const base = tableOffset + index * entrySize

    return { name: elf.readUInt32LE(base), offset: Number(elf.readBigUInt64LE(base + 0x18)), size: Number(elf.readBigUInt64LE(base + 0x20)) }
  }
  const names = header(namesIndex)
  const nameOf = ({ name }) => elf.toString('latin1', names.offset + name, names.offset + name + 64).split('\0')[0]

  return Array.from({ length: count }, (_, index) => header(index)).find(section => nameOf(section) === name)
}

/** The runtime with the update information in its section, the rest is as it was */
const embedUpdateInformation = (runtime, information) => {
  const section = findSection(runtime, sectionName)
  const text = Buffer.from(information, 'utf8')

  if (!section) throw new Error(`The runtime has no ${sectionName} section`)
  if (text.length >= section.size) throw new Error(`The update information is ${text.length} bytes, the section holds ${section.size - 1}`)

  const patched = Buffer.from(runtime)
  patched.fill(0, section.offset, section.offset + section.size)
  text.copy(patched, section.offset)

  return patched
}

/** The update information of an AppImage or its runtime, undefined when there is none */
const readUpdateInformation = elf => {
  const section = findSection(elf, sectionName)
  const text = section && elf.toString('utf8', section.offset, section.offset + section.size).split('\0')[0]

  return text || undefined
}

module.exports = { embedUpdateInformation, readUpdateInformation, updateInformation }
