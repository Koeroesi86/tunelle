const { readdirSync, statSync, writeFileSync } = require('fs')
const { extname, join } = require('path')
const { random } = require('./perf-library')

// usage: node scripts/perf-profile.js <library folder> [output.json] [sample size]
// reads the shape of a real library into numbers, for the generated library of the perf runs (scripts/perf-library.js): how many tracks an album has, how many albums an artist, how deep the folders go,
// which formats and which other files are in them, and, from a sample of the files, how long and how big they are and which tags and pictures they carry
// only numbers are written: no name of an artist, an album or a file leaves the folder

const audio = new Set(['.flac', '.mp3', '.m4a', '.ogg', '.opus', '.wav', '.aac', '.wma'])

/** The folders below a folder, each with its files, as { path, depth, files } */
const walk = (folder, depth = 0) => {
  const entries = readdirSync(folder, { withFileTypes: true })
  const here = { path: folder, depth, files: entries.filter(entry => entry.isFile()).map(entry => entry.name) }
  return [here, ...entries.filter(entry => entry.isDirectory()).flatMap(entry => walk(join(folder, entry.name), depth + 1))]
}

const count = values => values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {})
const share = (values, predicate) => (values.length ? values.filter(predicate).length / values.length : 0)

const shape = folders => {
  const withAudio = folders.filter(({ files }) => files.some(file => audio.has(extname(file).toLowerCase())))
  const files = folders.flatMap(({ files: names }) => names.map(name => extname(name).toLowerCase()))
  const artists = folders.filter(({ depth }) => depth === 1)
  return {
    tracksPerAlbumFolder: withAudio.map(({ files: names }) => names.filter(name => audio.has(extname(name).toLowerCase())).length),
    // a top level folder is an artist, the album folders below it are its albums
    albumFoldersPerArtist: artists.map(({ path }) => withAudio.filter(folder => folder.path.startsWith(path)).length),
    albumFolderDepth: count(withAudio.map(({ depth }) => depth)),
    formats: count(files.filter(extension => audio.has(extension)).map(extension => extension.slice(1))),
    // the share of the album folders that hold a file of the kind
    otherFiles: Object.fromEntries(
      ['.jpg', '.jpeg', '.png', '.cue', '.log', '.m3u', '.txt', '.nfo', '.pdf'].map(extension => [extension.slice(1), share(withAudio, ({ files: names }) => names.some(name => name.toLowerCase().endsWith(extension)))])
    )
  }
}

const sampleOf = (paths, size, next) =>
  [...paths]
    .map(path => [next(), path])
    .sort(([a], [b]) => a - b)
    .slice(0, size)
    .map(([, path]) => path)

const nonAscii = text => /[^\x20-\x7e]/.test(text)

const readSample = async (paths, parseFile) => {
  const read = []
  for (const path of paths) {
    try {
      const { common, format, native } = await parseFile(path)
      const picture = common.picture?.[0]
      const comments = Object.values(native).flat()
      read.push({
        megabytes: statSync(path).size / 1e6,
        seconds: format.duration ?? 0,
        kbps: (format.bitrate ?? 0) / 1000,
        sampleRate: format.sampleRate ?? 0,
        bits: format.bitsPerSample ?? 0,
        pictureKilobytes: picture ? picture.data.length / 1000 : 0,
        pictureFormat: picture?.format ?? '',
        title: common.title ?? '',
        artist: common.artist ?? '',
        album: common.album ?? '',
        albumArtist: common.albumartist ?? '',
        genre: common.genre?.[0] ?? '',
        year: `${common.year ?? ''}`,
        trackNumber: common.track?.no ?? 0,
        discNumber: common.disk?.no ?? 0,
        replayGain: comments.some(({ id }) => /replaygain/i.test(id))
      })
    } catch {
      // a file that cannot be read is no part of the sample
    }
  }
  return read
}

const rounded = (values, step) => values.map(value => Math.round(value / step) * step)

const tags = sample => ({
  sampled: sample.length,
  // seconds to the nearest ten, kilobytes and megabytes to one decimal: the list is drawn from, so its length is its weight
  durationSeconds: rounded(sample.map(({ seconds }) => seconds), 10).filter(seconds => seconds > 0),
  megabytes: rounded(sample.map(({ megabytes }) => megabytes), 0.5),
  kbps: rounded(sample.map(({ kbps }) => kbps), 32).filter(kbps => kbps > 0),
  sampleRates: count(sample.map(({ sampleRate }) => sampleRate)),
  bitDepths: count(sample.map(({ bits }) => bits)),
  pictureKilobytes: rounded(sample.map(({ pictureKilobytes }) => pictureKilobytes), 10),
  pictureFormats: count(sample.map(({ pictureFormat }) => pictureFormat)),
  titleLengths: sample.map(({ title }) => title.length).filter(length => length > 0),
  missing: {
    title: share(sample, ({ title }) => !title),
    artist: share(sample, ({ artist }) => !artist),
    album: share(sample, ({ album }) => !album),
    albumArtist: share(sample, ({ albumArtist }) => !albumArtist),
    genre: share(sample, ({ genre }) => !genre),
    year: share(sample, ({ year }) => !year),
    trackNumber: share(sample, ({ trackNumber }) => !trackNumber)
  },
  albumArtistDiffers: share(sample, ({ artist, albumArtist }) => Boolean(albumArtist) && albumArtist !== artist),
  multiDisc: share(sample, ({ discNumber }) => discNumber > 1),
  replayGain: share(sample, ({ replayGain }) => replayGain),
  // the share of the names that have a character outside of ASCII
  nonAscii: share(sample, ({ title, artist, album }) => [title, artist, album].some(nonAscii))
})

/** The profile of the library in a folder, from `size` of its files read with the parseFile of music-metadata */
const profileOf = async (folder, size, parseFile) => {
  const folders = walk(folder)
  const paths = folders.flatMap(({ path, files }) => files.filter(file => audio.has(extname(file).toLowerCase())).map(file => join(path, file)))
  return { tracks: paths.length, ...shape(folders), tags: tags(await readSample(sampleOf(paths, size, random(1)), parseFile)) }
}

const main = async () => {
  const [folder, output = 'library-profile.json', size = '500'] = process.argv.slice(2)
  if (!folder) {
    console.error('usage: node scripts/perf-profile.js <library folder> [output.json] [sample size]')
    process.exit(1)
  }

  const { parseFile } = await import('music-metadata')
  const profile = await profileOf(folder, Number(size), parseFile)
  writeFileSync(output, `${JSON.stringify(profile)}\n`)
  console.log(`${profile.tracks} tracks, ${profile.tags.sampled} of them read, written to ${output}`)
}

if (require.main === module) main()

module.exports = { profileOf, shape, tags }
