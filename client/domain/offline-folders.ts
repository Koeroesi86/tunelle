const withoutTrailingSeparator = (folderPath: string) => folderPath.replace(/[\\/]+$/, '');

/** Whether a file is in one of the offline folders or below it */
export const isOffline = (filePath: string, offlineFolders: string[]) =>
  offlineFolders.some((folderPath) => {
    const folder = withoutTrailingSeparator(folderPath);
    return filePath.startsWith(folder) && /[\\/]/.test(filePath.charAt(folder.length));
  });
