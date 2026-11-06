// usage: node scripts/release/rebase-auto-merge.js    rebases the pull request whose auto-merge was enabled first onto master, when it is behind
// master requires up to date branches, so with auto-merge on several pull requests every merge leaves the others behind: only the first one in the order the
// auto-merge was enabled is looked at, and the ones behind it wait until it merges, or until its auto-merge is off (rebase-auto-merge.yml)
const query = `query ($owner: String!, $name: String!, $base: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, baseRefName: $base, first: 100) {
      nodes {
        number
        headRefOid
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

const run = async (request, repository, base) => {
  const [owner, name] = repository.split('/')
  const { data, errors } = await request('/graphql', { method: 'POST', body: JSON.stringify({ query, variables: { owner, name, base } }) })
  if (errors) throw new Error(`GraphQL: ${JSON.stringify(errors)}`)

  const [next] = queue(data.repository.pullRequests.nodes)
  if (!next) return console.log('No pull request has auto-merge on')
  if (next.mergeable === 'CONFLICTING') return console.log(`#${next.number} has a conflict, the queue waits for its author`)

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

module.exports = { createRequest, queue, run }
