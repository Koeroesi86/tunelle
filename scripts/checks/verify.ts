import { spawnSync } from 'child_process';

// usage: tsx scripts/checks/verify.ts [--from <check>]   runs the checks of CLAUDE.md in order and stops at the first failure
//        prints one line per check and only the end of the output of the one that failed, so a run costs a few lines instead of the whole log
const checks: [string, string[]][] = [
  ['lint', ['run', 'lint']],
  ['fallow', ['run', 'fallow']],
  ['typecheck', ['run', 'typecheck']],
  ['test:coverage', ['run', 'test:coverage']],
  ['test:integration', ['run', 'test:integration']],
  ['security:electron', ['run', 'security:electron']],
  ['build', ['run', 'build']],
];
const failureLines = 40;

const tail = (output: string, lines: number) => output.trimEnd().split('\n').slice(-lines).join('\n');

const runNpm = (args: string[]) => {
  const { status, stdout, stderr } = spawnSync('npm', args, { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  return { ok: status === 0, output: `${stdout ?? ''}${stderr ?? ''}` };
};

// the checks from `from` on, each result `{ name, ok, output }`; nothing runs after a failure
interface CheckResult {
  name: string;
  ok: boolean;
  output: string;
}

const runChecks = (list: [string, string[]][], run: (args: string[]) => { ok: boolean; output: string }, from?: string) => {
  const start = Math.max(
    0,
    list.findIndex(([name]) => name === from)
  );
  return list
    .slice(start)
    .reduce<CheckResult[]>((results, [name, args]) => (results.some((result) => !result.ok) ? results : [...results, { name, ...run(args) }]), []);
};

const report = (results: CheckResult[]) =>
  results.map(({ name, ok, output }) => (ok ? `PASS ${name}` : `FAIL ${name}\n${tail(output, failureLines)}`)).join('\n');

if (require.main === module) {
  const [flag, from] = process.argv.slice(2);
  const start = Math.max(
    0,
    checks.findIndex(([name]) => name === (flag === '--from' ? from : undefined))
  );
  const results = runChecks(checks, runNpm, flag === '--from' ? from : undefined);
  console.log(report(results));
  console.log(
    `not run: ${
      checks
        .slice(start + results.length)
        .map(([name]) => name)
        .join(', ') || 'none'
    }`
  );
  process.exit(results.every((result) => result.ok) ? 0 : 1);
}

export { checks, tail, runChecks, report };
