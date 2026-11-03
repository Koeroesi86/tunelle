const { readFileSync } = require('fs')
const { compareVersions } = require('./version')

// usage: node scripts/store-submission.js status <file>                            fails unless the last submission in the output of `msstore submission status` is published
//        node scripts/store-submission.js check <tag> <file> <package version>...  fails when the release can not go to the Store, with the output of `msstore submission get` in <file>
// store.yml runs both before it submits a release. The Store takes a version only when it is greater than the one of the last submission and its fourth part is 0
// (the Store keeps that part for itself, electron-builder adds the 0)
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
  if (status !== 'Published') throw new Error(`The last submission is ${status}, not Published: wait for it, or finish it in Partner Center, before submitting another`)
}

// msstore writes the keys of the submission in Pascal case (ApplicationPackages, Version), the API of the Store in camel case
const field = (object, name) => Object.entries(object ?? {}).find(([key]) => key.toLowerCase() === name)?.[1]

// the output of `msstore submission get` is the submission as JSON, with a line or two of the progress display around it
const readStoreVersion = (output) => {
  const text = withoutColours(output)
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  const versions = (field(JSON.parse(json), 'applicationpackages') ?? []).map((applicationPackage) => field(applicationPackage, 'version')).filter(Boolean)
  if (versions.length === 0) throw new Error('The submission has no package with a version, so the version in the Store is not known')
  return versions.map(releaseVersion).sort(compareVersions).at(-1)
}

const assertSubmittable = (tag, storeVersion, packageVersions) => {
  const version = tag.match(tagPattern)?.[1]
  if (!version) throw new Error(`${tag} is not a release tag like v26.10.14`)
  if (compareVersions(version, releaseVersion(storeVersion)) <= 0) throw new Error(`${version} is not greater than ${storeVersion} of the last submission: the Store would refuse it`)
  if (packageVersions.length === 0) throw new Error('No package version was given')

  const wrong = packageVersions.filter((packageVersion) => packageVersion !== `${version}.0`)
  if (wrong.length > 0) throw new Error(`The packages have the version ${wrong.join(', ')}, the Store needs ${version}.0 (the fourth part 0, the same as the tag)`)
}

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'status') assertPublished(readFileSync(args[0], 'utf8'))
  else if (command === 'check') {
    const [tag, file, ...packageVersions] = args
    const storeVersion = readStoreVersion(readFileSync(file, 'utf8'))
    assertSubmittable(tag, storeVersion, packageVersions)
    console.log(`${tag} is greater than ${storeVersion} of the last submission`)
  } else throw new Error('usage: store-submission.js status <file> | check <tag> <file> <package version>...')
}

module.exports = { assertPublished, assertSubmittable, readStoreVersion, readStatus, releaseVersion }
