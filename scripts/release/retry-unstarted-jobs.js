// usage: node scripts/release/retry-unstarted-jobs.js    cancels the runs whose waiting jobs no runner took, and runs their jobs again once
// A job that no runner picks up holds its run, which cannot be run again until it ends (retry-unstarted-jobs.yml, docs/development/ci.md)
const workflows = ['pr-checks.yml', 'build.yml', 'release.yml']
const stalledMinutes = 15
const lastAttempt = 2
const waitSeconds = 5
const cancelAttempts = 12
const forceCancelAttempts = 48

const createRequest = (token) => async (path, options) => {
  if (!token) throw new Error('GH_TOKEN is not set')
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }
  })
  if (!response.ok) throw new Error(`${options?.method ?? 'GET'} ${path} answered ${response.status}: ${await response.text()}`)
  const text = await response.text()
  return text ? JSON.parse(text) : undefined
}

// every job that has not ended is queued without a runner, for longer than the limit: a job that is running, or waits for approval, is left alone
const isStalled = (jobs, now) => {
  const unfinished = jobs.filter((job) => job.status !== 'completed')
  return (
    unfinished.length > 0 &&
    unfinished.every((job) => job.status === 'queued' && !job.runner_id && now - Date.parse(job.created_at) > stalledMinutes * 60 * 1000)
  )
}

const waitUntilCompleted = async (request, repository, id, attempts) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { status } = await request(`/repos/${repository}/actions/runs/${id}`)
    if (status === 'completed') return true
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
  }
  return false
}

// a job with always() (required-checks of pr-checks.yml) runs after a cancel and needs a runner as well: when the run does not end, force-cancel skips it
const cancel = async (request, repository, id) => {
  await request(`/repos/${repository}/actions/runs/${id}/cancel`, { method: 'POST' })
  if (await waitUntilCompleted(request, repository, id, cancelAttempts)) return
  console.log(`Run ${id} did not end after the cancel, it is cancelled by force`)
  await request(`/repos/${repository}/actions/runs/${id}/force-cancel`, { method: 'POST' })
  if (!(await waitUntilCompleted(request, repository, id, forceCancelAttempts))) throw new Error(`Run ${id} did not end after it was cancelled by force`)
}

// a run with more jobs than one page lists is left alone: a running job could be on the page that is not read
const isRunStalled = async (request, repository, id, now) => {
  const { jobs, total_count: total } = await request(`/repos/${repository}/actions/runs/${id}/jobs?per_page=100`)
  return !(total > jobs.length) && isStalled(jobs, now)
}

const retry = async (request, repository, id, now) => {
  // the jobs are read again just before the cancel: a runner may have taken one since the run was found
  if (!(await isRunStalled(request, repository, id, now))) return console.log(`Run ${id} has a job that a runner took, it is left alone`)
  await cancel(request, repository, id)
  await request(`/repos/${repository}/actions/runs/${id}/rerun-failed-jobs`, { method: 'POST' })
  console.log(`Run ${id} had jobs that no runner took, they run again`)
}

const findRuns = async (request, repository) =>
  (
    await Promise.all(
      workflows.flatMap((workflow) =>
        ['queued', 'in_progress'].map(async (status) => {
          const { workflow_runs: runs } = await request(`/repos/${repository}/actions/workflows/${workflow}/runs?status=${status}&per_page=50`)
          return runs
        })
      )
    )
  ).flat()

const run = async (request, repository, now = Date.now()) => {
  const runs = await findRuns(request, repository)
  const stalled = (
    await Promise.all(runs.filter((item) => item.run_attempt <= lastAttempt).map(async (item) => ((await isRunStalled(request, repository, item.id, now)) ? item : undefined)))
  ).filter(Boolean)

  if (stalled.length === 0) return console.log(`${runs.length} runs are waiting or running, none has jobs that no runner took`)
  for (const item of stalled) await retry(request, repository, item.id, now)
}

if (require.main === module) {
  run(createRequest(process.env.GH_TOKEN), process.env.GITHUB_REPOSITORY).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { createRequest, isStalled, run }
