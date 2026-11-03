/** Split a folder path into its own name and the folder it sits in, for both kinds of separator */
export const splitFolderPath = (folderPath: string) => {
  const trimmed = folderPath.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const name = trimmed.slice(cut + 1);

  return name ? { name, parent: trimmed.slice(0, cut + 1) } : { name: folderPath, parent: '' };
};

const portalPrefix = /^\/run\/user\/\d+\/doc\/[^/]+\//;

/** The path as the user picked it: a folder the Flatpak sandbox sees through the document portal (/run/user/1000/doc/<id>/Music) is shown from the picked folder on (Music) */
export const displayFolderPath = (folderPath: string) => (portalPrefix.test(folderPath) ? folderPath.replace(portalPrefix, '') : folderPath);
