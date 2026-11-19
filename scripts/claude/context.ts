import { formatState, issueNumber, readIssue, readState, trimIssue } from './git-state';

// usage: tsx scripts/claude/context.ts [issue number or url]   the branch, its pull request with the state of the checks, the issue it closes
// (title and the start of each section) and the changed files against master: what a session needs to start, in one call instead of five
// See docs/development/claude-usage.md
const render = () => {
  const state = readState();
  const number = issueNumber(process.argv[2], state.branch, state.pullRequest);
  const issue = number ? readIssue(number) : undefined;
  return [
    formatState(state),
    issue ? `\nissue #${issue.number}: ${issue.title}\n${trimIssue(issue.body)}` : '\nissue: none found (pass its number)',
    state.stat.length ? `\nchanged against origin/master:\n${state.stat.join('\n')}` : '',
  ].join('\n');
};

if (require.main === module) {
  console.log(render());
}
