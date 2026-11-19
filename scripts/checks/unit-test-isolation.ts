import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

// the rule of docs/development/unit-tests.md: a unit test takes nothing from the system it runs on
const root = resolve(__dirname, '../..');
const folders = ['electron', 'client', 'shared', 'scripts', '.claude', '.github', 'packaging'];
const unitTest = /\.test\.tsx?$/;
const otherTier = /\.(integration|timing)\.test\./;

// what a unit test must not use, and the modules that it may use it from when the test mocks the module (`vi.mock('http', …)`) or spies on it (`vi.spyOn(http, …)`)
const realWorld = [
  { pattern: /test-database/, modules: [] },
  { pattern: /from 'sqlite3'/, modules: ['sqlite3'] },
  { pattern: /mkdtemp|tmpdir\(/, modules: ['fs', 'os'] },
  { pattern: /createServer/, modules: ['http', 'https', 'net'] },
  { pattern: /spawnSync|execFileSync|execSync/, modules: ['child_process', 'childProcess'] },
];

const isReplaced = (text: string, module: string) => new RegExp(`vi\\.mock\\('(node:)?${module}'|vi\\.spyOn\\(${module},`).test(text);

const listFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);

    return entry.isDirectory() ? (entry.name === 'node_modules' ? [] : listFiles(path)) : [path];
  });

export const usesRealWorld = (text: string) => realWorld.some(({ pattern, modules }) => pattern.test(text) && !modules.some((module) => isReplaced(text, module)));

/** The unit tests that use a real database, folder, server or process, as paths from the root */
export const findRealWorldTests = (): string[] =>
  folders
    .flatMap((folder) => listFiles(join(root, folder)))
    .map((file) => relative(root, file).split(sep).join('/'))
    .filter((file) => unitTest.test(file) && !otherTier.test(file))
    .filter((file) => usesRealWorld(readFileSync(join(root, file), 'utf8')))
    .sort();
