-- The version of the app that failed to measure a track: another version tries it once more, as it may decode what an earlier one did not (docs/app/loudness-background.md).
-- null for a measurement, and for a failure stored before this column, which is tried again too.
ALTER TABLE track_loudness ADD COLUMN appVersion TEXT;
