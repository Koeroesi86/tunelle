interface AddedFile {
  name: string;
  path: string;
  lastModified: number;
}

/** The picked folder files carry a relative path from the folder; dropped folders come as the directory itself */
const toAddedFiles = (files: File[], getPath: (file: File) => string): AddedFile[] => {
  const added = files.map((file) => {
    const [root, ...rest] = file.webkitRelativePath.split('/');
    if (rest.length === 0) return { name: file.name, path: getPath(file), lastModified: file.lastModified };

    const parent = getPath(file).slice(0, getPath(file).length - file.webkitRelativePath.length);
    return { name: root, path: `${parent}${root}`, lastModified: Date.now() };
  });

  return added.filter((file, index) => added.findIndex((other) => other.path === file.path) === index);
};

export default toAddedFiles;
