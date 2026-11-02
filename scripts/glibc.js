// whether a version is newer than the limit
const exceedsGlibc = ([major, minor], [limitMajor, limitMinor]) => major > limitMajor || (major === limitMajor && minor > limitMinor)

// the newest glibc symbol version a binary asks for (GLIBC_2.38 in its dynamic symbol table), as [major, minor]; [0, 0] when it asks for none
const highestGlibc = buffer =>
  [...buffer.toString('latin1').matchAll(/GLIBC_(\d+)\.(\d+)/g)]
    .map(([, major, minor]) => [Number(major), Number(minor)])
    .reduce((highest, version) => (exceedsGlibc(version, highest) ? version : highest), [0, 0])

module.exports = { exceedsGlibc, highestGlibc }
