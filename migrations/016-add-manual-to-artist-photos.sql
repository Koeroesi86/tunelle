-- 1 is a photo the user chose (or removed: picture is NULL then), which the lookup of 010 never touches. 0 is one the lookup found or did not find.
-- A reset deletes the row, so the name is looked up again.
ALTER TABLE artist_photos ADD COLUMN manual INTEGER NOT NULL DEFAULT 0;
