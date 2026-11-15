-- 1 when a change of the playlist is written back to the file it was imported from (docs/app/playlist-export.md); on for every playlist that has a file, the user can turn it off.
ALTER TABLE playlists ADD COLUMN source_sync INTEGER NOT NULL DEFAULT 0;
UPDATE playlists SET source_sync = 1 WHERE source_path IS NOT NULL;
