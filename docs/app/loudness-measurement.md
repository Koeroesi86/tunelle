# Loudness measurement

The player levels tracks with the ReplayGain tags of a file (`trackGain`, `albumGain`, `trackPeak`, `albumPeak` of `library`, read by `electron/library/reading/read-loudness.ts`). For a file without tags the app measures the loudness itself. The plan and its open points are in issue #173; this page describes what is built.

## Where a measurement is kept

`track_loudness` (migration `014`) holds one row per measured track, apart from `library`: a scan writes every column of a track from its tags (`addTracks`), so a measured gain in `library` would be replaced by an empty tag at the next scan of a changed file.

| Column | Meaning |
|---|---|
| `status`, `reason` | `measured`, or `failed` with why (a failed row is not measured again until the file changes) |
| `trackGain`, `trackPeak`, `albumGain`, `albumPeak` | in the units of the tags: dB at -18 LUFS, and a ratio of full scale (a peak can be above 1) |
| `fileModified`, `fileSize` | the stat of the file that was measured |
| `analysisVersion` | the algorithm and the JSON shape (`analysisVersion` in `client/loudness/summarise.ts`) |
| `analysis` | the JSON of `LoudnessAnalysis` (`shared/types/loudness.d.ts`): the integrated loudness, the loudness range, the peak, a curve of at most 256 points and a histogram of the 400 ms blocks. A view that shows them reads the JSON of the one track |

A row counts only while its `fileModified` and `fileSize` equal the ones of the track in `library`, the test the scan uses to skip an unchanged file. A changed file makes its row stale and it is ignored. Rows are deleted with their tracks (`deleteTracks`, `deleteTracksInside`).

## Where the player gets it

The lists of the library (`/library`, `/library/tracks`, `/library/album`) do not carry the loudness: it would be a lookup for each row of thousands. The player reads it for the track that plays and the one that loads next, from `GET tunelle://app/library/track?path=` (`findTrackFormat` in `electron/repositories/library-repository.ts`, `useTrackLoudness` in `client/hooks/use-track-loudness.ts`), which answers with the format and the four loudness values, or 404 for a track the library does not have. A track plays as it is until the answer comes, and keeps the values it was given (a playlist or favourite snapshot) when there is none.

For each of the four values the answer is the tag first and the measured value for what the tags lack: `COALESCE(library.x, (SELECT x FROM track_loudness ...))` (`effectiveLoudness`). A query that names the loudness columns itself (`getLibrary(database, query, ['path', 'trackGain'])`) gets the same, a lookup by primary key for each row it returns.

The JSON is not in these answers: `findLoudnessAnalysis` reads it for one track.

## The measurement (`client/loudness/`)

ITU-R BS.1770 / EBU R128 at 48 kHz, the rate `decodeAudioData` resamples to:

- K-weighting (`k-weighting.ts`: a high shelf, then a high pass) and channel weights (`channel-weights.ts`: surround 1.41, the LFE channel left out, by the channel order of the decoder).
- Blocks of 400 ms every 100 ms (`block-energies.ts`), run one hop at a time so a long file needs no copy of its samples. `createBlockMeter` takes a file in pieces, one after the other: the filters and the hop that is being filled go on from one piece to the next, so the blocks are those of the whole file.
- `summarise.ts` gates the blocks (-70 LUFS absolute, then 10 LU below the rest), gives the integrated loudness, the loudness range (3 s short term values, gates at -70 and -20 LU, the 10th to the 95th percentile), the curve, the histogram (bins of 0.1 LU keyed by the bin number) and the gain to -18 LUFS.
- `summarise` takes the `BlockStats` of one or more parts and pools their blocks for the gating, the histogram and the peak.
- The peak is the highest sample after the resampling, not a true peak.

## Measuring in the background

`registerLoudness` (`electron/library/loudness/loudness-source.ts`) puts the measurement on the [background queue](task-queue.md) as a source of tasks: one track a task, in the order of the paths, until every track has a valid row, then it rests for a minute before it looks for new ones (and for the ones that did not answer). A scan that ends during the rest ends it, as the scan may have added tracks.

- **What is measured:** a track with no row, a row of another file than the library has now, or a row of an older `analysisVersion` (`findTracksToMeasure`). A failed row is not tried again until the file changes or the version rises. Every track is analysed; the gain and the peak are stored only for a track whose tags lack them (`computeGain`), so the tags always win.
- **When it runs** (all must hold, asked before each track): no scan is running and none has run for 30 s (`TUNELLE_LOUDNESS_IDLE_SECONDS`, see [building.md](../development/building.md)), nothing plays (the player reports it with `PLAYBACK_STATE`), the computer is not on battery, and the setting `measureLoudness` is not `false` (on by default, the switch is in the settings). A scan that starts waits for the file in progress, which takes a few seconds, not for the whole queue.
- **Drives that do not answer:** before each track the first byte of its file is read by a process of its own for the library folder it is in (`createMountGuard`, `mount-probe-worker.ts`), not by the main process. A read on a hard mounted NFS or SMB share that went away cannot be interrupted, and each such call of the main process holds one of the few threads that all its file and database calls share, so a few of them would freeze the app. A file that does not answer in 10 s is given up on, the process is killed, and the folder answers no, without another call, until that process ends, which it does when the share is back. The track is left for a later pass and counts nothing against it; the other folders are not held up. What the page reads of a track that was readable when it began still goes through the main process (`/track`), so a share that goes away in the middle of a track can hold one thread, until the share is back.
- **The decoder** is a hidden window (`loudness-window.ts`) that loads `loudness.html` (`client/loudness/page.ts`, built by webpack like the main page) with a small preload. It fetches the track from `tunelle://app/track`, decodes it with `decodeAudioData` and measures it, so every format the player plays works and nothing native is packaged. It runs at a low priority (`os.setPriority`), one file at a time, and is made again after 50 files to give back the memory of the decoded sound. A window that crashes, or that makes no progress for five minutes, is closed. Progress is what the page tells (`LOUDNESS_PROGRESS`, at most once a second): a chunk of the file read, a piece decoded. So the time that counts is the time without progress (`createStallTimer`): a slow drive that keeps delivering never times out, however long a file takes, and a stuck one does.
- **Results:** `measured`, or `failed` with `undecodable` (the browser cannot decode it), `silent` (no block above the gate), `crashed` (the window died), `too-large` (a file longer than 45 minutes in a format that is not cut, see below) or `timeout`. A file that cannot be fetched (a drive that went away), a page that did not load, or a track that did not answer is not stored and is tried again after the rest; a track that did not answer three times in a row (counted while the app runs) is stored as `timeout`, so it does not take the window for the time of a timeout on every pass. A measurement that went through ends the count.

## Long files

A file longer than 45 minutes (`wholeFileSeconds` in `client/loudness/measure-track.ts`) is not decoded as a whole, as the decoded sound of 60 minutes of stereo took 2.9 GB of the window. The main process gives the page the length of the track (`MeasureRequest.duration`), and `measureSliced` (`client/loudness/measure-sliced.ts`) cuts the file into pieces of about five minutes of sound, fetches each with a range request of `tunelle://app/track`, decodes it, measures it with the one `createBlockMeter` and lets it go, so one piece is in memory at a time (115 MB of stereo).

`client/loudness/slicing/` cuts by the format, found from the first bytes of the file (`slicerOf`):

| Format | Cut | Left out of the piece |
|---|---|---|
| WAV | between two samples, with a header of its own for each piece and the format chunk of the file | nothing |
| FLAC | at the start of a frame (the sync code, allowed fields and the CRC-8 of the header, as the sync code alone is in the sound too often), with the stream marker and the metadata of the file in front | nothing |
| MP3 | at the start of a frame (three headers that follow each other by their lengths), a few frames early | the frames before the cut, which only give the decoder what the bit reservoir holds |

A format that is not cut (Ogg, M4A, AAC) is stored as `too-large` and plays at its tags, or not levelled. The decoder resamples each piece to 48 kHz by itself, so a piece has a rounding of the first and last samples at its ends. Against the decoding of the whole file, on tracks of the library cut into pieces of 10 MB, the integrated loudness and the loudness range agreed to 0.0001 LU, and the peak to within 1 %.

## The gain of an album

`poolAlbumGains` (`electron/library/loudness/album-gains.ts`) gives the tracks of an album the gain pooled from the stored histograms, so no file is decoded: the blocks of all the tracks are gated together again (`poolAlbum` in `shared/utils/pool-loudness.ts`), as the blocks of one long track are, which is not the average of the gains of the tracks. A block counts as the middle of its bin of 0.1 LU, so the loudness is off by 0.05 dB at most. The peak is the highest of the tracks.

- An album is a folder and a title, as everywhere in the library; the tracks of a folder without an album title are no album.
- Only an album whose tracks **all** have their analysis (a measurement of the file as it is, of the version) gets a gain. A track that failed, or that was not measured yet, leaves the album on the track gains of its tracks, which is what album mode does for a file without album tags (`normalizationGain`).
- The gain is stored on the row of each track (`albumGain`, `albumPeak`) with the number of tracks it was pooled from (`albumTracks`, migration `015`). `findAlbumsToPool` finds the albums whose tracks do not all have the number of tracks the album has now (new, a track added or taken away, a file measured again), and the ones that have a pooled gain and lost a track's analysis, which lose the gain. An album with no block above the gate is marked as pooled without a gain.
- The queue task runs when a track is measured (at most every 5 s), at the end of each pass over the library and when the app starts, as a scan can have changed the library while it was closed; it waits while a scan runs. The tags win here too: a track with album tags keeps them, the others take the pooled gain.

## In the settings

The tile "Measure loudness" (`client/components/settings/measure-loudness/`) has the switch (`measureLoudness`, saved with the other settings and read by the main process before each track), the progress and "Clear measured values".

- The progress is `LoudnessProgress` (`shared/types/loudness.d.ts`): the tracks, those with a measurement of the file as it is, and those that could not be measured (`getLoudnessProgress`). The tile asks for it (`LOUDNESS_STATUS_LOAD`) when it opens and when the switch changes, and the main process sends it (`LOUDNESS_STATUS`) at most every 2 s while it measures, at the end of a pass and after a clear.
- "Clear measured values" (`LOUDNESS_CLEAR`) deletes every row of `track_loudness`, including the pooled album gains, and starts the measurement again from the first track (`restart`); with the switch off the tracks stay unmeasured and play at their tag gains.

## Not built yet

The route for the JSON and the histogram on the now playing view, and the cutting of Ogg, Opus and M4A (which need their own containers read) follow in the pull requests listed in #173.
