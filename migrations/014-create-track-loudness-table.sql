-- The loudness the app measured of a track (docs/app/loudness-measurement.md), kept apart from the library as a scan writes every column of a track from its tags.
-- A row counts while its file stat is the one of the track; a track whose tags have a gain uses the tags. status is measured or failed, with the reason for a failure.
-- analysis is the JSON of the measurement (the curve and the histogram of the blocks): it is read for one track, never in a list of tracks.
CREATE TABLE IF NOT EXISTS track_loudness (
  path TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  trackGain REAL,
  trackPeak REAL,
  albumGain REAL,
  albumPeak REAL,
  fileModified INTEGER,
  fileSize INTEGER,
  analysisVersion INTEGER NOT NULL,
  reason TEXT,
  analysis TEXT
);
