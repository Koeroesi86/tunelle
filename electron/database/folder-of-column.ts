/** The folder of a path column including the trailing separator, for both separators: rtrim drops the characters after the last one */
export const folderOfColumn = (column: string) => `rtrim(${column}, replace(replace(${column}, '/', ''), '\\', ''))`;
