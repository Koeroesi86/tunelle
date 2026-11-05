import path from 'path';

/** The folder of the album art inside the data folder of the app */
export const getAlbumArtFolder = (appDataPath: string) => path.join(appDataPath, './albumart/');
