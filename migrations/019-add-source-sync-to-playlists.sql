-- 1 when a change of the playlist is written back to the file it was imported from (docs/app/playlist-export.md), off until the user turns it on.
ALTER TABLE playlists ADD COLUMN source_sync INTEGER NOT NULL DEFAULT 0;
