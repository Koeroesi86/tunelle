// usage: node scripts/release/rebase-auto-merge.js    rebases the pull request whose auto-merge was enabled first onto master, when it is behind
// master requires up to date branches, so with auto-merge on several pull requests every merge leaves the others behind: only the first one in the order the
// auto-merge was enabled is looked at, and the ones behind it wait until it merges, or until its auto-merge is off (rebase-auto-merge.yml)
const childProcess = require('child_process')

const query = `query ($owner: String!, $name: String!, $base: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, baseRefName: $base, first: 100) {
      nodes {
        number
        headRefOid
        headRefName
        isCrossRepository
        mergeable
        autoMergeRequest { enabledAt }
      }
    }
  }
}`

// the checks are not looked at: a pull request that fails or conflicts holds the ones behind it until its author fixes it or turns its auto-merge off
const queue = (pullRequests) =>
  pullRequests
    .filter((pullRequest) => pullRequest.autoMergeRequest)
    .sort((a, b) => a.autoMergeRequest.enabledAt.localeCompare(b.autoMergeRequest.enabledAt))

const createRequest = (token) => async (path, options) => {
  if (!token) throw new Error('GH_TOKEN is not set')
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error(`${options?.method ?? 'GET'} ${path} answered ${response.status}: ${await response.text()}`)
  return response.json()
}

// the commits at the start of the branch that belong to a merged pull request are the ones of the pull request below, which was squash merged: the last one is
// the old base. See docs/release/releases.md
const findOldBase = async (request, repository, number) => {
  const commits = await request(`/repos/${repository}/pulls/${number}/commits?per_page=100`)
  const merged = await Promise.all(
    commits.map(async ({ sha }) => (await request(`/repos/${repository}/commits/${sha}/pulls`)).some((item) => item.merged_at && item.number !== number))
  )
  const own = merged.indexOf(false)
  return own > 0 ? commits[own - 1].sha : undefined
}

const gitEnv = () => ({
  ...process.env,
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64')}`,
  GIT_COMMITTER_NAME: 'github-actions[bot]',
  GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com'
})

const git = (...args) =>
  new Promise((resolve, reject) => {
    const child = childProcess.execFile('git', args, { env: gitEnv() }, (error) => (error ? reject(error) : resolve()))
    child?.stdout?.pipe(process.stdout)
    child?.stderr?.pipe(process.stderr)
  })

// replays the commits after oldBase onto master, and pushes only when the branch still is the one that was seen
const replay = async (next, oldBase, base) => {
  await git('fetch', 'origin', base, next.headRefName)
  await git('switch', '--detach', next.headRefOid)
  try {
    await git('rebase', '--onto', `origin/${base}`, oldBase)
  } catch {
    await git('rebase', '--abort')
    return false
  }
  await git('push', `--force-with-lease=refs/heads/${next.headRefName}:${next.headRefOid}`, 'origin', `HEAD:refs/heads/${next.headRefName}`)
  return true
}

const rebaseConflicting = async (request, repository, base, next) => {
  const oldBase = next.isCrossRepository ? undefined : await findOldBase(request, repository, next.number)
  if (!oldBase) return console.log(`#${next.number} has a conflict, the queue waits for its author`)
  if (!(await replay(next, oldBase, base))) return console.log(`#${next.number} has a conflict of its own commits, the queue waits for its author`)
  console.log(`Replayed the commits of #${next.number} after ${oldBase} onto ${base}`)
}

const run = async (request, repository, base) => {
  const [owner, name] = repository.split('/')
  const { data, errors } = await request('/graphql', { method: 'POST', body: JSON.stringify({ query, variables: { owner, name, base } }) })
  if (errors) throw new Error(`GraphQL: ${JSON.stringify(errors)}`)

  const [next] = queue(data.repository.pullRequests.nodes)
  if (!next) return console.log('No pull request has auto-merge on')
  if (next.mergeable === 'CONFLICTING') return rebaseConflicting(request, repository, base, next)

  const { behind_by: behindBy } = await request(`/repos/${repository}/compare/${base}...${next.headRefOid}`)
  if (behindBy === 0) return console.log(`#${next.number} is up to date, the queue waits for it to merge`)

  await request(`/repos/${repository}/pulls/${next.number}/update-branch`, {
    method: 'PUT',
    body: JSON.stringify({ expected_head_sha: next.headRefOid, update_method: 'rebase' })
  })
  console.log(`Rebased #${next.number}, ${behindBy} commits behind ${base}`)
}

if (require.main === module) {
  run(createRequest(process.env.GH_TOKEN), process.env.GITHUB_REPOSITORY, 'master').catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { createRequest, findOldBase, queue, run }
