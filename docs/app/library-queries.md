# Library queries

## The albums page (`getAlbumPage` in `electron/repositories/library-repository.ts`)

A folder and an album title make one album. The default order is the first track of the album; a sort by the artist or the year takes the value of that first track, and the albums that are equal keep the default order.

The page is limited to:

- the albums of the tracks below the folders, when there are any;
- the albums with a track of the group, when there is one;
- the albums that have a track matching the search (the album keeps all its tracks in its count and its duration).

It returns the number of albums with the page.
