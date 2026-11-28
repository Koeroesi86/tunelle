import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { z } from 'zod';

// the test pyramid of docs/development/unit-tests.md: a test above the unit tier says what the tier below can not show
const root = resolve(__dirname, '../..');
const folders = ['e2e', 'electron', 'client', 'shared', 'scripts', '.claude', '.github', 'packaging'];

const tiers = [
  { file: /^e2e\/.*\.spec\.ts$/, reason: /^\/\/ Needs the real app: \S/m, line: '// Needs the real app: <what a lower tier can not show>' },
  {
    file: /\.integration\.test\.tsx?$/,
    reason: /^\/\/ Needs the real [^:\n]+: \S/m,
    line: '// Needs the real <thing>: <what a unit test can not show>',
  },
];

const editSchema = z.object({
  file_path: z.string(),
  content: z.string().optional(),
  old_string: z.string().optional(),
  new_string: z.string().optional(),
  replace_all: z.boolean().optional(),
});

type Edit = z.infer<typeof editSchema>;

const toRepositoryPath = (file: string) => relative(root, resolve(root, file)).split(sep).join('/');

const listFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);

    return entry.isDirectory() ? (entry.name === 'node_modules' ? [] : listFiles(path)) : [path];
  });

/** What is wrong with a test file of this path and text, or undefined when it has its reason or needs none */
export const findMissingReason = (file: string, text: string): string | undefined => {
  const path = toRepositoryPath(file);
  const tier = tiers.find((candidate) => candidate.file.test(path));

  return tier && !tier.reason.test(text) ? `${path} lacks the line "${tier.line}"` : undefined;
};

/** The end to end specs and integration test files without their reason */
export const findFilesWithoutReason = (): string[] =>
  folders
    .map((folder) => join(root, folder))
    .filter((folder) => existsSync(folder))
    .flatMap(listFiles)
    .map((file) => findMissingReason(file, readFileSync(file, 'utf8')))
    .filter((problem) => problem !== undefined)
    .sort();

const textAfter = ({ content, old_string: before = '', new_string: after = '', replace_all: all }: Edit, current: string) => {
  if (content !== undefined) return content;
  // a function, as `$` in a replacement text would be read as a pattern
  return all ? current.replaceAll(before, () => after) : current.replace(before, () => after);
};

/** The problem a Write or an Edit would make; an edit of a file that lacks the reason already passes, so that it can be mended */
export const findEditProblem = (edit: Edit): string | undefined => {
  const file = resolve(root, edit.file_path);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  if (edit.content === undefined && current !== undefined && findMissingReason(file, current)) return undefined;

  return findMissingReason(file, textAfter(edit, current ?? ''));
};

// the input of one Edit or Write on stdin, for .claude/hooks/guard-test-tier.sh
const main = () => {
  const problem = findEditProblem(z.object({ tool_input: editSchema }).parse(JSON.parse(readFileSync(0, 'utf8'))).tool_input);
  if (problem) console.error(problem);
  process.exit(problem ? 1 : 0);
};

if (require.main === module) main();
