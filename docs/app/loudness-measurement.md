# Loudness measurement

The player levels tracks with the ReplayGain tags of a file (`trackGain`, `albumGain`, `trackPeak`, `albumPeak` of `library`, read by `electron/library/reading/read-loudness.ts`). For a file without tags the app measures the loudness itself. The plan and its open points are in issue #173; this page describes what is built.

## Where a measurement is kept

`track_loudness` (migration `014`) holds one row per measured track, apart from `library`: a scan writes every column of a track from its tags (`addTracks`), so a measured gain in `library` would be replaced by an empty tag at the next scan of a changed file.

| Column | Meaning |
|---|---|
| `status`, `reason` | `measured`, or `failed` with why (a failed row is not measured again until the file changes) |
| `trackGain`, `trackPeak`, `albumGain`, `albumPeak` | in the units of the tags: dB at -18 LUFS, and a ratio of full scale (a peak can be above 1) |
| `integratedLufs`, `loudnessRange` | for the views, so no JSON is parsed for them |
| `fileModified`, `fileSize` | the stat of the file that was measured |
| `analysisVersion` | the algorithm and the JSON shape (`analysisVersion` in `client/loudness/summarise.ts`) |
| `analysis` | the JSON of `LoudnessAnalysis` (`shared/types/loudness.d.ts`): a loudness curve of at most 256 points and a histogram of the 400 ms blocks |

A row counts only while its `fileModified` and `fileSize` equal the ones of the track in `library`, the test the scan uses to skip an unchanged file. A changed file makes its row stale and it is ignored. Rows are deleted with their tracks (`deleteTracks`, `deleteTracksInside`).

## What a query returns

The queries that list tracks (`getLibrary`, `getTrackPage`, `getAlbumTracks`, `getTracksInside`) and `findTrackFormat` return, for each of the four loudness columns, the tag first and the measured value for what the tags lack: `COALESCE(library.x, (SELECT x FROM track_loudness ...))` (`effectiveLoudness` in `electron/repositories/library-repository.ts`). The player takes the gain as it takes the tags (`normalizationGain` in `client/audio/loudness.ts`).

- It is a lookup by primary key for each row returned, not a join, as the queries name the columns of `library` without a table. `getTrackPage` cuts the page first, so the lookups are for the rows of the page; on 50 000 tracks a page at offset 40 000 took 40 ms with measured rows, against 52 ms before.
- The JSON is not in these lists: `findLoudnessAnalysis` reads it for one track.

## The measurement (`client/loudness/`)

ITU-R BS.1770 / EBU R128 at 48 kHz, the rate `decodeAudioData` resamples to:

- K-weighting (`k-weighting.ts`: a high shelf, then a high pass) and channel weights (`channel-weights.ts`: surround 1.41, the LFE channel left out, by the channel order of the decoder).
- Blocks of 400 ms every 100 ms (`block-energies.ts`), run one hop at a time so a long file needs no copy of its samples.
- `summarise.ts` gates the blocks (-70 LUFS absolute, then 10 LU below the rest), gives the integrated loudness, the loudness range (3 s short term values, gates at -70 and -20 LU, the 10th to the 95th percentile), the curve, the histogram (bins of 0.1 LU keyed by the bin number) and the gain to -18 LUFS.
- A file decoded in pieces gives one `BlockStats` per piece; the pieces are pooled by `summarise`, as the order of the blocks does not matter for the histogram, the gating or the peak.
- The peak is the highest sample after the resampling, not a true peak.

## Not built yet

The decoding window, the queue and its conditions, the album gain from the histograms, the setting and the route for the JSON follow in the pull requests listed in #173.
