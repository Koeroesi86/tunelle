# Loudness measurement

The player levels tracks with the ReplayGain tags of a file (`trackGain`, `albumGain`, `trackPeak`, `albumPeak` of `library`, read by `electron/library/reading/read-loudness.ts`). For a file without tags the app measures the loudness itself. The plan and its open points are in issue #173; this page describes what is built.

More: [loudness: measuring in the background](loudness-background.md).

## Where a measurement is kept

`track_loudness` (migration `014`) holds one row per measured track, apart from `library`: a scan writes every column of a track from its tags (`addTracks`), so a measured gain in `library` would be replaced by an empty tag at the next scan of a changed file.

| Column | Meaning |
|---|---|
| `status`, `reason` | `measured`, or `failed` with why (a failed row is not measured again until the file or the version of the app changes) |
| `trackGain`, `trackPeak`, `albumGain`, `albumPeak` | in the units of the tags: dB at -18 LUFS, and a ratio of full scale (a peak can be above 1) |
| `fileModified`, `fileSize` | the stat of the file that was measured |
| `analysisVersion` | the algorithm and the JSON shape (`analysisVersion` in `client/loudness/summarise.ts`) |
| `appVersion` | of a failed row, the version of the app that failed, see [failures and updates](loudness-background.md#failures-and-updates) |
| `analysis` | the JSON of `LoudnessAnalysis` (`shared/types/loudness.d.ts`): the integrated loudness, the loudness range, the peak, a curve of at most 256 points and a histogram of the 400 ms blocks. A view that shows them reads the JSON of the one track |

A row counts only while its `fileModified` and `fileSize` equal the ones of the track in `library`, the test the scan uses to skip an unchanged file. A changed file makes its row stale and it is ignored. Rows are deleted with their tracks (`deleteTracks`, `deleteTracksInside`).

## Where the player gets it

The lists of the library (`/library`, `/library/tracks`, `/library/album`) do not carry the loudness: it would be a lookup for each row of thousands. The player reads it for the track that plays and the one that loads next, from `GET tunelle://app/library/track?path=` (`findTrackFormat` in `electron/repositories/library-repository.ts`, `useTrackLoudness` in `client/hooks/use-track-loudness.ts`), which answers with the format and the four loudness values, or 404 for a track the library does not have. A track plays as it is until the answer comes, and keeps the values it was given (a playlist or favourite snapshot) when there is none.

For each of the four values the answer is the tag first and the measured value for what the tags lack: `COALESCE(library.x, (SELECT x FROM track_loudness ...))` (`effectiveLoudness`). A query that names the loudness columns itself (`getLibrary(database, query, ['path', 'trackGain'])`) gets the same, a lookup by primary key for each row it returns.

The JSON is not in these answers. `GET tunelle://app/library/loudness?path=` gives the `LoudnessAnalysis` of one track (`findLoudnessAnalysis`), or 404 for a track that was not measured, failed, or whose file changed since. The now playing page shows it for the song that plays (`LoudnessPanel` in `client/components/ui/loudness-panel/`, not for a radio station): the histogram in bars of 1 LU from the quietest to the loudest one with blocks, a muted marker at the integrated loudness, a thin line that moves across the histogram from left to right as the song plays, with the bars before it lit and the ones after it dimmed (the share of the track that was played, from the position the player has and the length of the track; none for a track without a length), and the loudness, the range and the peak (in dBFS). Above them is the sample rate of the file and whether the audio context resamples it (see [the audio context](audio-context.md)); that line shows for a track that is not measured too. It reads the track again when another one plays, and, for a song that is not measured yet, whenever the main process tells how far the measurement is (`LOUDNESS_STATUS`: after a track, and after the albums are pooled), so a song that is measured while it plays shows the panel then. The player reads the gains of the song that plays and of the next one again on the same message, so the level follows what was measured, and the album gain, without a change of song.

## The measurement (`client/loudness/`)

ITU-R BS.1770 / EBU R128 at 48 kHz, the rate `decodeAudioData` resamples to:

- K-weighting (`k-weighting.ts`: a high shelf, then a high pass) and channel weights (`channel-weights.ts`: surround 1.41, the LFE channel left out, by the channel order of the decoder).
- Blocks of 400 ms every 100 ms (`block-energies.ts`), run one hop at a time so a long file needs no copy of its samples. `createBlockMeter` takes a file in pieces, one after the other: the filters and the hop that is being filled go on from one piece to the next, so the blocks are those of the whole file.
- `summarise.ts` gates the blocks (-70 LUFS absolute, then 10 LU below the rest), gives the integrated loudness, the loudness range (3 s short term values, gates at -70 and -20 LU, the 10th to the 95th percentile), the curve, the histogram (bins of 0.1 LU keyed by the bin number) and the gain to -18 LUFS.
- `summarise` takes the `BlockStats` of one or more parts and pools their blocks for the gating, the histogram and the peak.
- The peak is the highest sample after the resampling, not a true peak.

## The gain of an album

`poolAlbumGains` (`electron/library/loudness/album-gains.ts`) gives the tracks of an album the gain pooled from the stored histograms, so no file is decoded: the blocks of all the tracks are gated together again (`poolAlbum` in `shared/utils/pool-loudness.ts`), as the blocks of one long track are, which is not the average of the gains of the tracks. A block counts as the middle of its bin of 0.1 LU, so the loudness is off by 0.05 dB at most. The peak is the highest of the tracks.

- An album is a folder and a title, as everywhere in the library; the tracks of a folder without an album title are no album.
- Only an album whose tracks **all** have their analysis (a measurement of the file as it is, of the version) gets a gain. A track that failed, or that was not measured yet, leaves the album on the track gains of its tracks, which is what album mode does for a file without album tags (`normalizationGain`).
- The gain is stored on the row of each track (`albumGain`, `albumPeak`) with the number of tracks it was pooled from (`albumTracks`, migration `015`). `findAlbumsToPool` finds the albums whose tracks do not all have the number of tracks the album has now (new, a track added or taken away, a file measured again), and the ones that have a pooled gain and lost a track's analysis, which lose the gain. An album with no block above the gate is marked as pooled without a gain.
- The queue task runs when a track is measured (at most every 5 s), at the end of each pass over the library and when the app starts, as a scan can have changed the library while it was closed; it waits while a scan runs. The tags win here too: a track with album tags keeps them, the others take the pooled gain.

## In the settings

The tile "Measure loudness" (`client/components/settings/measure-loudness/`) has the switch (`measureLoudness`, saved with the other settings and read by the main process before each track), the progress and "Clear measured values".

- The progress is `LoudnessProgress` (`shared/types/loudness.d.ts`): the tracks, those with a measurement of the file as it is, and those that could not be measured (`getLoudnessProgress`). The tile asks for it (`LOUDNESS_STATUS_LOAD`) when it opens and when the switch changes, and the main process sends it (`LOUDNESS_STATUS`) at most every 2 s while it measures, at the end of a pass, after a clear, and when a scan ends (it may have added or taken away tracks, and the count would stay stale until the next measurement).
- Under the count of tracks that could not be measured is a link, "Show the files", that opens a modal (`FailedTracksModal`) with the file name, the path and why of each one. The tile asks for the list (`LOUDNESS_FAILED_LOAD`) when the link is clicked and the main process answers with `LOUDNESS_FAILED` (`getFailedLoudnessTracks`, the failures that count in the progress: a failure is forgotten when the file, the analysis version or the version of the app changes). The list is not kept up to date while the modal is open, and is forgotten after "Clear measured values".
- "Clear measured values" (`LOUDNESS_CLEAR`) deletes every row of `track_loudness`, including the pooled album gains, and starts the measurement again from the first track (`restart`); with the switch off the tracks stay unmeasured and play at their tag gains.

## Not built yet

The loudness curve over the length of the track (`shortTerm`) is stored but not shown.
