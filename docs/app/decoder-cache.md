# The caches of the decoder

Where decoded and downloaded files are kept, and for how long. Part of [The decoder proxy](decoder-proxy.md).

## The cache

Only whole decodes and the downloads of server tracks are written to disk. The whole decodes go to the `whole-decodes` [cache folder](#folders); playing an album of a progressive codec adds nothing to it (`windowed-track.integration.test.ts` and `windowed-track.test.ts` check that). A whole decode takes rate × channels × bytes per sample × seconds; lossy audio, in float, takes twice the room of 16 bit (5 minutes of 44.1 kHz stereo are 106 MB), so about 19 such tracks fit. The key is a hash of the path, the size and modification time of the source and the output format, so a changed file is decoded again and the old copy is evicted with time. A copy that is served gets its modification time set to now.

Before and after each decode the oldest files are removed until the cache is under 2 GiB, whatever the speed of the source (45 minutes of DSD fit, so an album is not decoded again when it is played again), except the [files in use](#files-in-use), the files (and `.part` files) of a running decode and the three that the player asked for last: the track that plays, the preloaded next one (`upNext`, whose request starts the decode early so the hand-off stays gapless) and the previous one. The requests of the loudness measurement and the windowed decodes, which write no file, do not count among them. Stale `.part` files go the same way. One file larger than the limit (a 32 bit float WAV of 44.1 kHz stereo passes 2 GiB at about 1 h 40 min) is kept while it is needed, as one of the three of the player or in use, and removed after that.

### Folders

| System | Folder of both caches |
| --- | --- |
| Linux | `$XDG_CACHE_HOME/tunelle`, or `~/.cache/tunelle` when it is not set or relative |
| macOS | `tunelle-<user id>` of the temp folder |
| Windows | `tunelle-user` of the temp folder, which each user has |

Symptom of [#583](https://github.com/Koeroesi86/tunelle/issues/583): on Linux the caches could fill `/tmp`, which is a tmpfs (in RAM) on Fedora and others, and the tracks that need the whole decode were then skipped. They are on disk now, so what went to RAM is written to the disk, the decodes of the loudness measurement included. The temp folder of macOS and Windows is on disk. The Flatpak sets `XDG_CACHE_HOME` to `~/.var/app/<id>/cache`, which needs no permission of the manifest (seen in another Flatpak on Fedora, on btrfs with a tmpfs `/tmp`; not in the one of Tunelle). To check: `echo $XDG_CACHE_HOME` in `flatpak run --command=sh io.github.koeroesi86.Tunelle`, and `df -T` of it.

The folders are made with the mode 0700 (`cache-folder.ts`). Before a file is read or written, the folder has to be a folder of this user and no link: where users share the temp folder, another one could put a folder with files of their own at a name that is known ([#576](https://github.com/Koeroesi86/tunelle/issues/576)). One that fails the check, also a `tunelle` of the cache folder that is a link, is not used: the error is logged, a track that needs the whole decode answers 404 (MP3 and the other codecs that Chromium plays are served as they are), and a server track plays as the server sends it. The end to end tests and `npm run smoke` give the app an `XDG_CACHE_HOME` in their profile, and the integration tests clear it, so none writes into the cache of the machine.

Earlier versions used `tunelle-decoded`, `tunelle-whole-decodes` and `tunelle-source` for all users. The app removes them when it starts (`removeOldCache`), and on Linux the `tunelle-<user id>` of the temp folder too, as the limits only run for a whole decode or a download, which some libraries never start; the folder of another user stays, with an error in the log.

### Files in use

A file that is being read is not removed by either cache (`held-files.ts`): a request holds the decoded copy or the downloaded track until the body of its answer has ended, failed or been cancelled, and a decode window holds its source until it is dropped, as it starts ffmpeg on the file again when it decodes on. So a cache can be over its limit for a while.

A download that is asked for again counts as new, so the track that plays is not the oldest one after others were preloaded. That time is kept in memory: the modification time of a downloaded file is part of the key of its decoded copy, and changing it would decode the track again every time. After a restart the files count by their modification times.

### Measured after playing an album

The built app on Linux, one folder added and played at a time to the end of each track (by a seek near the end), with `TMPDIR` set to an empty folder. The sizes include what the loudness measurement decodes.

| played, in this order | files in the cache | bytes in the cache |
| --- | --- | --- |
| 5 tracks of 60 s: FLAC, ALAC, WavPack, AIFF, WAV (with two APE tracks of a few seconds in the library) | the folder was not made | 0 |
| then 9 tracks of 300 s of WMA, 44.1 kHz stereo, decoded to 16 bit when measured (float, twice the size, since [#576](https://github.com/Koeroesi86/tunelle/issues/576)) | 9 | 476,209,854 |
| then 9 tracks of 300 s of DSD64 stereo (generated silence) | 18 | 1,905,050,772, of which DSD 1,428,840,918 |

A folder of an earlier version (`tunelle-decoded`) put there before the start was gone after it. To measure again: a temporary spec that starts the app with `start({ env: { XDG_CACHE_HOME } })` (`TMPDIR` on macOS) and adds the folders one by one (with all of them in the library at once, the loudness measurement decodes the WMA and DSD tracks while the first album plays).
