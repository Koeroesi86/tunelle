import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

// the rule of docs/development/unit-tests.md: a unit test takes nothing from the system it runs on
const root = resolve(__dirname, '../..');
const folders = ['electron', 'client', 'shared', 'scripts', '.claude', '.github', 'packaging'];
const unitTest = /\.test\.tsx?$/;
const otherTier = /\.(integration|timing)\.test\./;
const realWorld = /test-database|from 'sqlite3'|mkdtemp|tmpdir\(|createServer|spawnSync|execFileSync|execSync/;

const listFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);

    return entry.isDirectory() ? (entry.name === 'node_modules' ? [] : listFiles(path)) : [path];
  });

export const usesRealWorld = (text: string) => realWorld.test(text);

/** The unit tests that use a real database, folder, server or process, as paths from the root */
export const findRealWorldTests = (): string[] =>
  folders
    .flatMap((folder) => listFiles(join(root, folder)))
    .map((file) => relative(root, file).split(sep).join('/'))
    .filter((file) => unitTest.test(file) && !otherTier.test(file))
    .filter((file) => usesRealWorld(readFileSync(join(root, file), 'utf8')))
    .sort();

export const readBaseline = (): string[] => JSON.parse(readFileSync(join(__dirname, 'unit-test-isolation-baseline.json'), 'utf8'));
