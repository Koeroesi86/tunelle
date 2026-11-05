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
- Blocks of 400 ms every 100 ms (`block-energies.ts`), run one hop at a time so a long file needs no copy of its samples.
- `summarise.ts` gates the blocks (-70 LUFS absolute, then 10 LU below the rest), gives the integrated loudness, the loudness range (3 s short term values, gates at -70 and -20 LU, the 10th to the 95th percentile), the curve, the histogram (bins of 0.1 LU keyed by the bin number) and the gain to -18 LUFS.
- A file decoded in pieces gives one `BlockStats` per piece; the pieces are pooled by `summarise`, as the order of the blocks does not matter for the histogram, the gating or the peak.
- The peak is the highest sample after the resampling, not a true peak.

## Measuring in the background

`registerLoudness` (`electron/library/loudness/loudness-source.ts`) puts the measurement on the [background queue](task-queue.md) as a source of tasks: one track a task, in the order of the paths, until every track has a valid row, then it rests for a minute before it looks for new ones (and for the ones that did not answer).

- **What is measured:** a track with no row, a row of another file than the library has now, or a row of an older `analysisVersion` (`findTracksToMeasure`). A failed row is not tried again until the file changes or the version rises. Every track is analysed; the gain and the peak are stored only for a track whose tags lack them (`computeGain`), so the tags always win.
- **When it runs** (all must hold, asked before each track): no scan is running and none has run for 30 s (`TUNELLE_LOUDNESS_IDLE_SECONDS`, see [building.md](../development/building.md)), nothing plays (the player reports it with `PLAYBACK_STATE`), the computer is not on battery, and the setting `measureLoudness` is not `false` (on by default; the settings screen follows in a later change). A scan that starts waits for the file in progress, which takes a few seconds, not for the whole queue.
- **Folders that are away:** the tracks of a library folder that cannot be read are left for a later pass (`findOfflineFolders`).
- **The decoder** is a hidden window (`loudness-window.ts`) that loads `loudness.html` (`client/loudness/page.ts`, built by webpack like the main page) with a small preload. It fetches the track from `tunelle://app/track`, decodes it with `decodeAudioData` and measures it, so every format the player plays works and nothing native is packaged. It runs at a low priority (`os.setPriority`), one file at a time, and is made again after 50 files to give back the memory of the decoded sound. A window that crashes, or does not answer in five minutes, is closed.
- **Results:** `measured`, or `failed` with `undecodable` (the browser cannot decode it), `silent` (no block above the gate), `crashed` (the window died) or `too-large`: a file longer than 45 minutes (`maxSeconds`) is not decoded as a whole, as the decoded sound of 60 minutes of stereo took 2.9 GB of the window. A file that cannot be fetched (a drive that went away) or that does not answer is not stored and is tried again after the rest.

## Not built yet

The album gain from the histograms, the settings screen and the progress, the route for the JSON, and the decoding of long files in pieces follow in the pull requests listed in #173.
