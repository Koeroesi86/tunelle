import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

// the rules of docs/ that a script can check, see CLAUDE.md
const root = resolve(__dirname, '../..');
const maxCommentLines = 4;
const commentRoots = ['electron', 'client', 'scripts', '.github'];
const commentFile = /\.(ts|tsx|js|yml|yaml|sh|ps1)$/;
const hashComments = /\.(yml|yaml|sh|ps1)$/;
const exempt = /(^|[\\/])(node_modules|e2e|migrations)[\\/]|\.test\.|\.shots\./;
const directive = /eslint-|fallow-ignore|@ts-|prettier-ignore|istanbul|c8 ignore|v8 ignore|^#!/;
const docLink = /docs\/[a-z0-9/-]+\.md/g;

const listFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);

    return entry.isDirectory() ? (entry.name === 'node_modules' ? [] : listFiles(path)) : [path];
  });

const isComment = (line: string, file: string) => (hashComments.test(file) ? /^\s*#/ : /^\s*(\/\/|\/\*|\*)/).test(line);

// the comment blocks of a file that are longer than the limit: [first line, length]; a directive comment is not counted
const findLongBlocks = (text: string, file: string): [number, number][] => {
  const lines = text.split('\n');
  const blocks = lines
    .map((line, index) => (isComment(line, file) && !directive.test(line) ? index : -1))
    .reduce<{ start: number; end: number }[]>((found, index) => {
      const last = found[found.length - 1];
      if (index < 0) return found;
      if (last && last.end === index - 1) last.end = index;
      else found.push({ start: index, end: index });

      return found;
    }, []);

  return blocks.filter(({ start, end }) => end - start + 1 > maxCommentLines).map(({ start, end }) => [start + 1, end - start + 1]);
};

const findLongComments = () =>
  commentRoots
    .map((folder) => join(root, folder))
    .filter(existsSync)
    .flatMap(listFiles)
    .filter((file) => commentFile.test(file) && !exempt.test(relative(root, file)))
    .flatMap((file) =>
      findLongBlocks(readFileSync(file, 'utf8'), file).map(
        ([line, length]) => `${relative(root, file)}:${line} is a comment of ${length} lines (at most ${maxCommentLines}): move it to docs/ and point to it`
      )
    );

const markdownFiles = () =>
  ['README.md', 'CLAUDE.md', ...listFiles(join(root, 'docs')).map((file) => relative(root, file))].filter((file) => file.endsWith('.md'));

const linksOf = (file: string) =>
  [...readFileSync(join(root, file), 'utf8').matchAll(/\]\(([^)\s]+)\)/g)]
    .map(([, target]) => target)
    .filter((target) => !/^([a-z]+:|#)/i.test(target))
    .map((target) => resolve(root, dirname(file), decodeURI(target.split('#')[0])));

const findBrokenLinks = () => {
  const inMarkdown = markdownFiles().flatMap((file) =>
    linksOf(file)
      .filter((target) => !existsSync(target))
      .map((target) => `${file} links to ${relative(root, target)}, which does not exist`)
  );
  const sources = commentRoots
    .concat('e2e')
    .map((folder) => join(root, folder))
    .filter(existsSync)
    .flatMap(listFiles)
    .filter((file) => commentFile.test(file));
  const inComments = sources.flatMap((file) =>
    (readFileSync(file, 'utf8').match(docLink) || [])
      .filter((doc) => !existsSync(join(root, doc)))
      .map((doc) => `${relative(root, file)} points to ${doc}, which does not exist`)
  );

  return [...inMarkdown, ...inComments];
};

const findUnlinkedDocs = () => {
  const linked = new Set(['README.md', 'CLAUDE.md'].flatMap(linksOf));

  return listFiles(join(root, 'docs'))
    .filter((file) => file.endsWith('.md') && !linked.has(file))
    .map((file) => `${relative(root, file).split(sep).join('/')} is not linked from README.md or CLAUDE.md`);
};

const findReadmeDetail = () => {
  const text = readFileSync(join(root, 'README.md'), 'utf8');

  return /```|^\|/m.test(text) ? ['README.md holds detail (a code block or a table): move it to docs/'] : [];
};

export { findLongBlocks, findLongComments, findBrokenLinks, findUnlinkedDocs, findReadmeDetail, maxCommentLines };

const checkEdit = (file: string) =>
  commentFile.test(file) && !exempt.test(relative(root, resolve(file)))
    ? findLongBlocks(readFileSync(0, 'utf8'), file).map(([line, length]) => `${file}:${line} is a comment of ${length} lines (at most ${maxCommentLines})`)
    : [];

if (require.main === module) {
  // with a file name and the new text on stdin: the check of one edit, for .claude/hooks/guard-comments.sh
  const [file] = process.argv.slice(2);
  const problems = file ? checkEdit(file) : [...findLongComments(), ...findBrokenLinks(), ...findUnlinkedDocs(), ...findReadmeDetail()];
  problems.forEach((problem) => console.error(problem));
  process.exit(problems.length ? 1 : 0);
}
