import { execFileSync } from 'child_process';

// usage: tsx scripts/checks/ci-failure.ts [run id | run url]   the failed jobs of a run (default: the latest run of the current branch), each with its
// operating system, the step that failed and the first error of its log, so the cause is found without reading the whole log
const errorPattern = /(?:\w*error|failed|fatal)\b|ERR!|✖|✘/i;
const logLines = 60;

interface Job {
  name: string;
  databaseId: number;
  conclusion: string;
  steps: { name: string; conclusion: string }[];
}

const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const parseRunId = (value: string) => value.match(/runs\/(\d+)/)?.[1] ?? value;

const failedJobs = (jobs: Job[]) =>
  jobs
    .filter((job) => job.conclusion === 'failure')
    .map(({ name, databaseId, steps }) => ({ name, databaseId, step: steps.find((step) => step.conclusion === 'failure')?.name }));

const firstError = (log: string) =>
  log
    .split('\n')
    .find((line) => errorPattern.test(line))
    ?.trim();

const describeJob = ({ name, step }: { name: string; step?: string }, log: string) =>
  [
    `FAILED ${name}`,
    `step: ${step ?? 'unknown (the job did not start or a "needs" failed)'}`,
    `first error: ${firstError(log) ?? 'none found'}`,
    '',
    log.trimEnd().split('\n').slice(-logLines).join('\n'),
  ].join('\n');

const latestRunId = () => {
  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  return gh(['run', 'list', '--branch', branch, '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId']).trim();
};

if (require.main === module) {
  const [argument] = process.argv.slice(2);
  const run = argument ? parseRunId(argument) : latestRunId();
  const { headSha, conclusion, jobs }: { headSha: string; conclusion: string; jobs: Job[] } = JSON.parse(
    gh(['run', 'view', run, '--json', 'headSha,conclusion,jobs'])
  );
  console.log(`run ${run} on ${headSha}: ${conclusion || 'not finished'}`);
  failedJobs(jobs).forEach((job) => console.log(`\n${describeJob(job, gh(['run', 'view', run, '--job', String(job.databaseId), '--log-failed']))}`));
}

export { parseRunId, failedJobs, firstError, describeJob };
