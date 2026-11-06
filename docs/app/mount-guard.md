# Calls on the library folders

A read on a hard mounted NFS or SMB share that went away cannot be interrupted, and it does not fail: it waits until the share is back. Each such call of the main process holds one of the few threads of the libuv pool that all its file calls and its database calls (`sqlite3`) share, so a few of them freeze the app. A timeout lets the caller go on, but the call stays and holds its thread.

So the main process does not make these calls. `mountGuard()` (`electron/library/mounts/mount-guard.ts`) makes them in a utility process of its own for each mount (a library folder, `mount-probe-worker.ts`), and everything that looks at a library folder asks it:

- **The check of the folders** (`findOfflineFolders`, `reportOfflineFolders`): `isEmpty` opens the folder and reads one entry. A folder that cannot be read is offline, so is an empty one that has tracks in the library.
- **The scan** (`rescan-library.ts`): `readTime`, the modification time of each folder.
- **The folder watcher** (`folder-watcher.ts`): `list`, the time of a directory and the directories in it, with up to 16 directories in flight.
- **The missing tracks** (`missing-tracks.ts`): `list`, the names in a directory. A directory is gone for `ENOENT` and `ENOTDIR`; for another error it counts as not answering, and its tracks are kept.
- **The loudness measurement**: `isReadable`, the first byte of a file ([loudness-measurement.md](loudness-measurement.md)).

A call that does not answer in 10 s is given up on: the process is killed, every call that waits on it answers no, and the mount answers no at once, without another call, until the process ends, which it does when the share is back. The next call then starts a new process. The other mounts are not held up.

What the scan reads of the files of a folder that answered (`scanFolder`, `isDirectory`) still goes through the main process, so a share that goes away in the middle of a scan can hold a thread until it is back.
