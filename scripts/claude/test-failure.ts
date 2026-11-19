import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { z } from 'zod';

// usage: tsx scripts/claude/test-failure.ts [vitest arguments]   runs `vitest run` and prints one line of totals and, for each failed test, its name and
// the start of its message, so a failing run costs a few lines and not the whole report. See docs/development/claude-usage.md
const failureLines = 8;
const reportSchema = z.object({
  numTotalTests: z.number(),
  numFailedTests: z.number(),
  testResults: z.array(
    z.object({
      name: z.string(),
      message: z.string().default(''),
      assertionResults: z.array(z.object({ fullName: z.string(), status: z.string(), failureMessages: z.array(z.string()).default([]) })),
    })
  ),
});

type Report = z.infer<typeof reportSchema>;

const parseReport = (output: string) => {
  const json = output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1);
  try {
    return reportSchema.safeParse(JSON.parse(json)).data;
  } catch {
    return undefined;
  }
};

const head = (text: string) => text.trim().split('\n').slice(0, failureLines).join('\n');

const failuresOf = ({ name, message, assertionResults }: Report['testResults'][number], root: string) => {
  const file = relative(root, name);
  const failed = assertionResults.filter(({ status }) => status === 'failed');
  const unrun = failed.length || !message ? [] : [`FAIL ${file}\n${head(message)}`];
  return [...failed.map(({ fullName, failureMessages }) => `FAIL ${file} > ${fullName}\n${head(failureMessages.join('\n'))}`), ...unrun];
};

const summarise = ({ numTotalTests, numFailedTests, testResults }: Report, root: string) =>
  [`${numTotalTests - numFailedTests} of ${numTotalTests} tests passed`, ...testResults.flatMap((result) => failuresOf(result, root))].join('\n\n');

const readFile = (file: string) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

if (require.main === module) {
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-test-failure-'));
  const file = join(folder, 'report.json');
  const { status, stdout, stderr } = spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${file}`, ...process.argv.slice(2)], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 256 * 1024 * 1024,
  });
  const report = parseReport(readFile(file));
  rmSync(folder, { recursive: true, force: true });
  console.log(
    report ? summarise(report, process.cwd()) : `no report; the end of the output:\n${`${stdout}${stderr}`.trim().split('\n').slice(-30).join('\n')}`
  );
  process.exit(status ?? 1);
}

export { parseReport, summarise };
