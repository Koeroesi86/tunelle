-- The modification time (milliseconds, whole) and the size (bytes) of the file a track was read from. A rescan skips a file whose two values are still the same, and reads its tags again when either differs.
-- NULL is a track stored before they were kept: its file is read once on the next scan, which fills them.
ALTER TABLE library ADD COLUMN fileModified INTEGER;
ALTER TABLE library ADD COLUMN fileSize INTEGER;
