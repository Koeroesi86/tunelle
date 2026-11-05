/** The path as the library stores it: with forward slashes on every system */
const normalizePath = (filePath?: string) => (filePath || '').replace(/\\/g, '/');

export default normalizePath;
