-- The playlist file a playlist was imported from (docs/app/playlist-import.md), NULL for a playlist that was made in the app.
-- source_path is the path as the library stores them (forward slashes), source_checksum the SHA-256 of the file as it was read, source_mtime its modification time (whole milliseconds),
-- source_encoding the text encoding it was read with.
ALTER TABLE playlists ADD COLUMN source_path TEXT;
ALTER TABLE playlists ADD COLUMN source_checksum TEXT;
ALTER TABLE playlists ADD COLUMN source_mtime INTEGER;
ALTER TABLE playlists ADD COLUMN source_encoding TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS playlists_source_path ON playlists (source_path) WHERE source_path IS NOT NULL;
