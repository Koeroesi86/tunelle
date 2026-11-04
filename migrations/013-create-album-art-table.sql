-- The main colour of each album picture, picked once from the picture file (electron/albumArtAccents.ts) and kept by the name of the picture, as the same picture is on every track of an album.
-- An empty accent is a picture that has no colour (a grey one): it is not picked again. A picture without a row has not been looked at yet.
CREATE TABLE IF NOT EXISTS album_art (
  picture TEXT PRIMARY KEY,
  accent TEXT NOT NULL
);
