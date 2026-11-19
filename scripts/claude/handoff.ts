import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { parseArgs } from 'util';
import { formatState, readState, type State } from './git-state';

// usage: tsx scripts/claude/handoff.ts <file> [--next "…"] [--decisions "…"] [--unverified "…"]   writes the facts of the branch (git and gh) and the
// three lines that only the session knows, in at most 15 lines, for a new session to read after /clear
// See docs/development/claude-usage.md
const maxLines = 15;

const formatHandoff = (state: State, notes: { next?: string; decisions?: string; unverified?: string }) =>
  [
    formatState(state),
    ...(state.dirty.length ? [`uncommitted: ${state.dirty.slice(0, 5).join('; ')}${state.dirty.length > 5 ? ` and ${state.dirty.length - 5} more` : ''}`] : []),
    ...(state.commits.length ? [`commits:`, ...state.commits.slice(0, 5).map((commit) => `  ${commit}`)] : []),
    `next: ${notes.next ?? 'not given'}`,
    `decisions not in the code: ${notes.decisions ?? 'none'}`,
    `not verified: ${notes.unverified ?? 'nothing noted'}`,
  ]
    .slice(0, maxLines)
    .join('\n');

const main = () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { next: { type: 'string' }, decisions: { type: 'string' }, unverified: { type: 'string' } },
  });
  const [file] = positionals;
  if (!file) {
    throw new Error('usage: handoff.ts <file> [--next …] [--decisions …] [--unverified …]');
  }
  writeFileSync(file, `${formatHandoff(readState(), values)}\n`);
  console.log(`${resolve(file)}\nrun /clear, then ask to read that file`);
};

if (require.main === module) {
  main();
}

export { formatHandoff };
