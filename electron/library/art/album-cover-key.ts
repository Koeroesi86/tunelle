import { folderOfColumn } from '../../database/folder-of-column';

/** The key of an album in `album_covers`: its folder without the trailing separator, a NUL and its title */
export const albumCoverKey = (folder: string, title: string) => `${folder.replace(/[/\\]+$/, '')}${String.fromCharCode(0)}${title}`;

/** The same key for the row of a track of the library, built in SQL */
export const albumCoverKeyColumn = `rtrim(${folderOfColumn('path')}, '/\\') || char(0) || COALESCE(album, '')`;
