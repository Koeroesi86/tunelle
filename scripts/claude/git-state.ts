import { execFileSync } from 'child_process';
import { z } from 'zod';

// what a session needs to know about its branch, read from git and gh in a few calls, trimmed so that it costs lines and not a log
// See docs/development/claude-usage.md
const checkSchema = z.object({
  name: z.string().optional(),
  context: z.string().optional(),
  status: z.string().optional(),
  conclusion: z.string().optional(),
  state: z.string().optional(),
});
const pullRequestSchema = z.object({
  number: z.number(),
  state: z.string(),
  url: z.string(),
  statusCheckRollup: z.array(checkSchema).default([]),
  closingIssuesReferences: z.array(z.object({ number: z.number() })).default([]),
});
const issueSchema = z.object({ number: z.number(), title: z.string(), body: z.string().default('') });

type Check = z.infer<typeof checkSchema>;
type PullRequest = z.infer<typeof pullRequestSchema>;
type Issue = z.infer<typeof issueSchema>;

const passing = ['SUCCESS', 'NEUTRAL', 'SKIPPED'];
const failing = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'];

const outcome = ({ conclusion, state, status }: Check) => (conclusion || state || status || 'PENDING').toUpperCase();

const summariseChecks = (checks: Check[]) => {
  const failed = checks.filter((check) => failing.includes(outcome(check))).map((check) => check.name ?? check.context ?? 'unnamed');
  const passed = checks.filter((check) => passing.includes(outcome(check))).length;
  const pending = checks.length - passed - failed.length;
  return [`${passed} passed`, `${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}`, `${pending} pending`].join(', ');
};

const trimIssue = (body: string, perSection = 12, total = 60) =>
  body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/^(?=#{1,4} )/m)
    .map((section) => section.trim().split('\n').filter(Boolean).slice(0, perSection).join('\n'))
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .slice(0, total)
    .join('\n');

const issueNumber = (argument: string | undefined, branch: string, pullRequest?: PullRequest) =>
  [argument?.match(/\d+/)?.[0], pullRequest?.closingIssuesReferences[0]?.number?.toString(), branch.match(/(?:^|[/-])(\d{2,5})(?:[/-]|$)/)?.[1]].find(Boolean);

const attempt = (command: string, args: string[]) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }).trimEnd();
  } catch {
    return '';
  }
};

const readPullRequest = () => {
  const output = attempt('gh', ['pr', 'view', '--json', 'number,state,url,statusCheckRollup,closingIssuesReferences']);
  return output.trim() ? pullRequestSchema.safeParse(JSON.parse(output)).data : undefined;
};

const readIssue = (number: string) => {
  const output = attempt('gh', ['issue', 'view', number, '--json', 'number,title,body']);
  return output.trim() ? issueSchema.safeParse(JSON.parse(output)).data : undefined;
};

const lines = (text: string) => text.split('\n').filter(Boolean);

const readState = () => ({
  branch: attempt('git', ['branch', '--show-current']).trim(),
  dirty: lines(attempt('git', ['status', '--short'])),
  commits: lines(attempt('git', ['log', '--oneline', 'origin/master..HEAD'])),
  stat: lines(attempt('git', ['diff', '--stat', 'origin/master...HEAD'])).slice(-15),
  pullRequest: readPullRequest(),
});

type State = ReturnType<typeof readState>;

const formatState = ({ branch, dirty, commits, pullRequest }: State) =>
  [
    `branch: ${branch || 'detached'}, ${commits.length} commits ahead of origin/master, ${dirty.length} uncommitted files`,
    pullRequest
      ? `pull request: #${pullRequest.number} ${pullRequest.state} ${pullRequest.url}; checks: ${summariseChecks(pullRequest.statusCheckRollup)}`
      : 'pull request: none',
  ].join('\n');

export { formatState, issueNumber, readIssue, readState, summariseChecks, trimIssue };
export type { Issue, State };
