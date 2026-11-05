const { appendFileSync, readFileSync, writeFileSync } = require('fs')
const { compareVersions } = require('./version')

// usage: node scripts/store-submission.js notes <file> <result> <notes> [<language>=<notes>]...
//        node scripts/store-submission.js decide <status file> <submission file> <tag> <automatic>
//        node scripts/store-submission.js status <file> | check <tag> <file> <package version>...   (see docs/microsoft-store.md)
const tagPattern = /^v(\d{2}\.(?:[1-9]|1[0-2])\.\d{1,5})$/

// the first three parts: the Store writes the version of a package with the fourth part, a release has none
const releaseVersion = (version) => version.split('.').slice(0, 3).join('.')

// msstore colours its progress text, also when its output is not a terminal
const withoutColours = (output) => output.replace(/\u001b\[[0-9;]*m/g, '')

const readStatus = (output) => withoutColours(output).match(/Submission Status = (\w+)/)?.[1]

// a submission that is not published (in certification, or failed and still there) blocks the next one: the Store keeps one per app, and nothing here deletes or cancels it
const assertPublished = (output) => {
  const status = readStatus(output)
  if (!status) throw new Error('The output of `msstore submission status` has no "Submission Status", so the state of the last submission is not known')
  if (status !== 'Published') throw new Error(`The last submission is ${status}, not Published: wait for it, or delete it in Partner Center (a draft of an earlier run without commit too), before submitting another`)
}

// msstore writes the keys of the submission in Pascal case (ApplicationPackages, Version), the API of the Store in camel case
const field = (object, name) => Object.entries(object ?? {}).find(([key]) => key.toLowerCase() === name)?.[1]

// the output of `msstore submission get` is the submission as JSON, with a line or two of the progress display around it
const parseSubmission = (output) => {
  const text = withoutColours(output)
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
}

const readStoreVersion = (output) => {
  const versions = (field(parseSubmission(output), 'applicationpackages') ?? []).map((applicationPackage) => field(applicationPackage, 'version')).filter(Boolean)
  if (versions.length === 0) throw new Error('The submission has no package with a version, so the version in the Store is not known')
  return versions.map(releaseVersion).sort(compareVersions).at(-1)
}

// a new submission is a copy of the last published one, with its "What's new" text: the same generic text for every version (in the language of each listing)
// takes the place of the one of the first submission. `msstore submission updateMetadata` replaces the whole submission, so the rest of it is sent back as it was read
const withReleaseNotes = (output, notes, translations = {}) => {
  const submission = parseSubmission(output)
  if (!notes) throw new Error('No release notes were given')
  if (Object.keys(submission.Listings ?? {}).length === 0) throw new Error('The submission has no listing, so there is nowhere to put the release notes')

  const listings = Object.fromEntries(Object.entries(submission.Listings).map(([language, listing]) => [language, { ...listing, BaseListing: { ...listing.BaseListing, ReleaseNotes: translations[language.split('-')[0].toLowerCase()] ?? notes } }]))
  // the packages of the last published submission are still in the copy, next to the new bundle: two packages for each architecture make the Store refuse the bundle, so every package that is not the one just uploaded is deleted with the update
  const packages = field(submission, 'applicationpackages')?.map((applicationPackage) => (field(applicationPackage, 'filestatus') === 'PendingUpload' ? applicationPackage : { ...applicationPackage, FileStatus: 'PendingDelete' }))
  return JSON.stringify({ ...submission, Listings: listings, ...(packages && { ApplicationPackages: packages }) }, undefined, 2)
}

// the states of a submission that is on its way (committed, not published yet): an automatic run waits for it. A draft (PendingCommit) or a failed submission that
// is still there needs somebody, so it stops every run
const inProgress = ['CommitStarted', 'PreProcessing', 'Certification', 'PendingPublication', 'Publishing', 'Release']

// automatic runs (after a release, weekly) skip quietly when there is nothing to do yet and stop with an error when somebody has to look; a manual run stops
// on everything it can not submit
const decide = (statusOutput, storeOutput, tag, automatic) => {
  const status = readStatus(statusOutput)
  if (automatic && inProgress.includes(status)) return { submit: false, reason: `The last submission is ${status}: ${tag} is not submitted now, a later run takes the latest release` }

  assertPublished(statusOutput)
  const version = tag.match(tagPattern)?.[1]
  if (!version) throw new Error(`${tag} is not a release tag like v26.10.14`)

  const storeVersion = readStoreVersion(storeOutput)
  if (automatic && compareVersions(version, storeVersion) <= 0) return { submit: false, reason: `${version} is not greater than ${storeVersion} of the last submission: nothing new to submit` }
  return { submit: true, reason: `${version} is greater than ${storeVersion} of the last submission` }
}

const assertSubmittable = (tag, storeVersion, packageVersions) => {
  const version = tag.match(tagPattern)?.[1]
  if (!version) throw new Error(`${tag} is not a release tag like v26.10.14`)
  if (compareVersions(version, releaseVersion(storeVersion)) <= 0) throw new Error(`${version} is not greater than ${storeVersion} of the last submission: the Store would refuse it`)
  if (packageVersions.length === 0) throw new Error('No package version was given')

  const wrong = packageVersions.filter((packageVersion) => packageVersion !== `${version}.0`)
  if (wrong.length > 0) throw new Error(`The packages have the version ${wrong.join(', ')}, the Store needs ${version}.0 (the fourth part 0, the same as the tag)`)
}

const read = (file) => readFileSync(file, 'utf8')

const run = ([command, ...args], env) => {
  if (command === 'notes') {
    const [file, result, notes, ...translations] = args
    const byLanguage = Object.fromEntries(translations.map((translation) => [translation.slice(0, translation.indexOf('=')).toLowerCase(), translation.slice(translation.indexOf('=') + 1)]))
    writeFileSync(result, withReleaseNotes(read(file), notes, byLanguage))
  } else if (command === 'decide') {
    const [statusFile, submissionFile, tag, automatic] = args
    const { submit, reason } = decide(read(statusFile), read(submissionFile), tag, automatic?.toLowerCase() === 'true')
    console.log(reason)
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `submit=${submit}\nreason=${reason}\n`)
  } else if (command === 'status') assertPublished(read(args[0]))
  else if (command === 'check') {
    const [tag, file, ...packageVersions] = args
    const storeVersion = readStoreVersion(read(file))
    assertSubmittable(tag, storeVersion, packageVersions)
    console.log(`${tag} is greater than ${storeVersion} of the last submission`)
  } else throw new Error('usage: store-submission.js status <file> | check <tag> <file> <package version>... | decide <status file> <submission file> <tag> <automatic> | notes <file> <result> <notes> [<language>=<notes>]...')
}

if (require.main === module) run(process.argv.slice(2), process.env)

module.exports = { assertPublished, assertSubmittable, decide, readStoreVersion, readStatus, releaseVersion, run, withReleaseNotes }
