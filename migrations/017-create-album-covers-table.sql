-- The cover the user chose for an album, by the folder of the album and its title (folder, char(0), title; no trailing separator).
-- picture is the file in the albumart folder, NULL when the user took the cover away. A reset deletes the row.
CREATE TABLE IF NOT EXISTS album_covers (
  key TEXT PRIMARY KEY,
  picture TEXT
);
