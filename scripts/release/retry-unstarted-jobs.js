// usage: node scripts/release/retry-unstarted-jobs.js             cancels the runs whose waiting jobs no runner took, and runs their jobs again once
//        node scripts/release/retry-unstarted-jobs.js <run id>    the same for one run, checked every few minutes until it ends (watch-unstarted-jobs.yml)
// A job that no runner picks up holds its run, which cannot be run again until it ends (retry-unstarted-jobs.yml, docs/development/ci.md)
const workflows = ['pr-checks.yml', 'build.yml', 'release.yml']
const stalledMinutes = 15
const lastAttempt = 2
const waitSeconds = 5
const pollSeconds = 300
const aggregateJob = 'required-checks'
const outageRuns = 3
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
const readJobs = async (request, repository, id) => {
  const { jobs, total_count: total } = await request(`/repos/${repository}/actions/runs/${id}/jobs?per_page=100`)
  return total > jobs.length ? undefined : jobs
}

const isRunStalled = async (request, repository, id, now) => {
  const jobs = await readJobs(request, repository, id)
  return jobs !== undefined && isStalled(jobs, now)
}

// GitHub ends a job that waited too long for a runner with a cancel and this annotation, while the rest of the run goes on (docs/development/ci.md)
const isNotAcquired = async (request, repository, job) => {
  if (job.conclusion !== 'cancelled' || job.runner_id) return false
  const annotations = await request(`/repos/${repository}/check-runs/${job.id}/annotations`)
  return annotations.some((annotation) => annotation.message.includes('was not acquired by Runner'))
}

// an ended run whose failures are all jobs that GitHub gave up on, and the check that only reports them: a job that ran and failed is left to a person
const hasOnlyNotAcquiredFailures = async (request, repository, id) => {
  const jobs = await readJobs(request, repository, id)
  const failed = (jobs ?? []).filter((job) => ['failure', 'cancelled', 'timed_out'].includes(job.conclusion))
  const flags = await Promise.all(failed.map((job) => isNotAcquired(request, repository, job)))
  return flags.some(Boolean) && failed.every((job, index) => flags[index] || job.name === aggregateJob)
}

const rerunNotAcquired = async (request, repository, id) => {
  if (!(await hasOnlyNotAcquiredFailures(request, repository, id))) return false
  await request(`/repos/${repository}/actions/runs/${id}/rerun-failed-jobs`, { method: 'POST' })
  console.log(`Run ${id} ended with jobs that GitHub found no runner for, they run again`)
  return true
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

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

// true when the run has ended without a job to run again, or was run again as often as it is allowed: there is nothing left to watch
const watchStep = async (request, repository, id) => {
  const { status, run_attempt: attempt } = await request(`/repos/${repository}/actions/runs/${id}`)
  if (attempt > lastAttempt) return true
  if (status === 'completed') return !(await rerunNotAcquired(request, repository, id))
  if (await isRunStalled(request, repository, id, Date.now())) await retryUnlessOutage(request, repository, id)
  return false
}

const watch = async (request, repository, id) => {
  let ended = await watchStep(request, repository, id)
  while (!ended) {
    await sleep(pollSeconds)
    ended = await watchStep(request, repository, id)
  }
  console.log(`Run ${id} ended, or was run again as often as allowed`)
}

const findStalled = async (request, repository, now) => {
  const runs = await findRuns(request, repository)
  const stalled = (
    await Promise.all(runs.filter((item) => item.run_attempt <= lastAttempt).map(async (item) => ((await isRunStalled(request, repository, item.id, now)) ? item : undefined)))
  ).filter(Boolean)
  return { runs, stalled }
}

// several runs without a runner at once mean that GitHub is short of runners: cancelling them only queues them again, behind the rest (docs/development/ci.md)
const isOutage = (stalled) => stalled.length >= outageRuns
const outageMessage = (stalled) => `${stalled.length} runs have jobs that no runner took at once, GitHub is short of runners and they are left alone`

const retryUnlessOutage = async (request, repository, id) => {
  const { stalled } = await findStalled(request, repository, Date.now())
  if (isOutage(stalled)) return console.log(outageMessage(stalled))
  await retry(request, repository, id, Date.now())
}

const run = async (request, repository, now = Date.now()) => {
  const { runs, stalled } = await findStalled(request, repository, now)

  if (stalled.length === 0) return console.log(`${runs.length} runs are waiting or running, none has jobs that no runner took`)
  if (isOutage(stalled)) return console.log(outageMessage(stalled))
  for (const item of stalled) await retry(request, repository, item.id, now)
}

const main = (runId) => {
  if (runId === undefined) return run(createRequest(process.env.GH_TOKEN), process.env.GITHUB_REPOSITORY)
  if (!/^\d+$/.test(runId)) throw new Error(`"${runId}" is not a run id`)
  return watch(createRequest(process.env.GH_TOKEN), process.env.GITHUB_REPOSITORY, runId)
}

if (require.main === module) {
  Promise.resolve(process.argv[2]).then(main).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { createRequest, isStalled, run, watch }
