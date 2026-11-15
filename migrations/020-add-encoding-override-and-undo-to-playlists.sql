-- source_encoding_override the encoding the user chose for the file of the playlist (docs/app/playlist-import.md); it stays when the file is read again.
-- previous_entries the entries (JSON) that a re-import of the file replaced, to go one step back; NULL when there is nothing to go back to.
ALTER TABLE playlists ADD COLUMN source_encoding_override TEXT;
ALTER TABLE playlists ADD COLUMN previous_entries TEXT;
