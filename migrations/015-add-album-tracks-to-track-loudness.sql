-- How many tracks the album had when its gain was pooled from the analyses of its tracks (docs/app/loudness-measurement.md), on the row of each track of the album.
-- NULL is a track whose album was not pooled yet; an album whose tracks all have the number of the tracks it has now is pooled, whether it has a gain or not.
ALTER TABLE track_loudness ADD COLUMN albumTracks INTEGER;
