// usage: node scripts/rebase-auto-merge.js    rebases the pull request whose auto-merge was enabled first onto master, when it is behind
// master requires up to date branches, so with auto-merge on several pull requests every merge leaves the others behind: this rebases one at a time, in
// the order the auto-merge was enabled, and its CI result lets GitHub merge it, which moves master and starts the next one (rebase-auto-merge.yml)
const query = `query ($owner: String!, $name: String!, $base: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, baseRefName: $base, first: 100) {
      nodes {
        number
        headRefOid
        mergeable
        autoMergeRequest { enabledAt }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`

// a conflict or a failed check needs a push of its author: it must not hold the ones behind it
const isWaiting = (pullRequest) =>
  pullRequest.mergeable !== 'CONFLICTING' && !['FAILURE', 'ERROR'].includes(pullRequest.commits.nodes[0]?.commit.statusCheckRollup?.state)

const pickNext = (pullRequests) =>
  pullRequests
    .filter((pullRequest) => pullRequest.autoMergeRequest)
    .filter(isWaiting)
    .sort((a, b) => a.autoMergeRequest.enabledAt.localeCompare(b.autoMergeRequest.enabledAt))
    .at(0)

const request = async (path, options) => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}`, 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error(`${options?.method ?? 'GET'} ${path} answered ${response.status}: ${await response.text()}`)
  return response.json()
}

const run = async (repository, base) => {
  const [owner, name] = repository.split('/')
  const { data, errors } = await request('/graphql', { method: 'POST', body: JSON.stringify({ query, variables: { owner, name, base } }) })
  if (errors) throw new Error(`GraphQL: ${JSON.stringify(errors)}`)

  const next = pickNext(data.repository.pullRequests.nodes)
  if (!next) return console.log('No pull request with auto-merge is waiting')

  const { behind_by: behindBy } = await request(`/repos/${repository}/compare/${base}...${next.headRefOid}`)
  if (behindBy === 0) return console.log(`#${next.number} is up to date, waiting for its checks`)

  await request(`/repos/${repository}/pulls/${next.number}/update-branch`, {
    method: 'PUT',
    body: JSON.stringify({ expected_head_sha: next.headRefOid, update_method: 'rebase' })
  })
  console.log(`Rebased #${next.number}, ${behindBy} commits behind ${base}`)
}

if (require.main === module) {
  if (!process.env.GH_TOKEN || !process.env.GITHUB_REPOSITORY) throw new Error('GH_TOKEN and GITHUB_REPOSITORY are not set')
  run(process.env.GITHUB_REPOSITORY, 'master').catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { pickNext }
