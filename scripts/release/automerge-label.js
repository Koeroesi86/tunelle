// usage: node scripts/release/automerge-label.js [disable <number>]    turns squash auto-merge on for the pull requests to master with the automerge label
// GitHub allows no auto-merge on a pull request of a stack whose base is not master yet: the label asks for it and this turns it on once the base is master
// (automerge-label.yml). See docs/release/releases.md
const { createRequest } = require('./rebase-auto-merge.js')

const label = 'automerge'

const query = `query ($owner: String!, $name: String!, $base: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, baseRefName: $base, first: 100) {
      nodes {
        number
        id
        isDraft
        isCrossRepository
        labels(first: 30) { nodes { name } }
        autoMergeRequest { enabledAt }
      }
    }
  }
}`

const enableMutation = `mutation ($id: ID!) {
  enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { pullRequest { number } }
}`

const disableMutation = `mutation ($id: ID!) {
  disablePullRequestAutoMerge(input: { pullRequestId: $id }) { pullRequest { number } }
}`

// a pull request from a fork is left alone: its author does not decide what merges
const wanted = (pullRequest) =>
  !pullRequest.isDraft &&
  !pullRequest.isCrossRepository &&
  !pullRequest.autoMergeRequest &&
  pullRequest.labels.nodes.some((item) => item.name === label)

const graphql = async (request, body) => {
  const { data, errors } = await request('/graphql', { method: 'POST', body: JSON.stringify(body) })
  if (errors) throw new Error(`GraphQL: ${JSON.stringify(errors)}`)
  return data
}

const list = async (request, repository, base) => {
  const [owner, name] = repository.split('/')
  const data = await graphql(request, { query, variables: { owner, name, base } })
  return data.repository.pullRequests.nodes
}

const enable = async (request, repository, base) => {
  const pullRequests = (await list(request, repository, base)).filter(wanted)
  if (pullRequests.length === 0) return console.log(`No pull request to ${base} with the ${label} label needs auto-merge`)

  const results = await Promise.allSettled(
    pullRequests.map((pullRequest) => graphql(request, { query: enableMutation, variables: { id: pullRequest.id } }).then(() => pullRequest.number))
  )
  results.filter((result) => result.status === 'fulfilled').forEach((result) => console.log(`Turned on squash auto-merge for #${result.value}`))
  const failed = results.filter((result) => result.status === 'rejected')
  failed.forEach((result) => console.error(result.reason))
  if (failed.length > 0) throw new Error(`${failed.length} pull requests could not get auto-merge`)
}

const disable = async (request, repository, base, number) => {
  const pullRequest = (await list(request, repository, base)).find((item) => item.number === number)
  if (!pullRequest?.autoMergeRequest) return console.log(`#${number} has no auto-merge to turn off`)

  await graphql(request, { query: disableMutation, variables: { id: pullRequest.id } })
  console.log(`Turned off auto-merge for #${number}`)
}

const run = (request, repository, base, [command, number] = []) =>
  command === 'disable' ? disable(request, repository, base, Number(number)) : enable(request, repository, base)

if (require.main === module) {
  run(createRequest(process.env.GH_TOKEN), process.env.GITHUB_REPOSITORY, 'master', process.argv.slice(2)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { run, wanted }
