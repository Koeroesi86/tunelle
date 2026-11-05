const { readFileSync, writeFileSync } = require('fs')
const { resolve } = require('path')

// usage: node scripts/release/version.js                    prints the version of a new release
//        node scripts/release/version.js --after <latest>   the same, but fails when it is not greater than the latest release
//        node scripts/release/version.js <version>          writes that version to package.json
// See docs/release/releases.md
const versionPattern = /^\d{2}\.(?:[1-9]|1[0-2])\.\d{1,5}$/

const createVersion = (date, runNumber) => `${String(date.getFullYear()).slice(2)}.${date.getMonth() + 1}.${runNumber}`

const compareVersions = (a, b) => {
  const [left, right] = [a, b].map((version) => version.split('.').map(Number))
  return left.map((part, index) => part - right[index]).find((difference) => difference !== 0) ?? 0
}

// the run number restarts when release.yml is renamed or recreated or its runs are deleted: electron-updater would never offer a version that is
// not greater than the installed one
const assertNewer = (version, latest) => {
  if (latest && compareVersions(version, latest.replace(/^v/, '')) <= 0)
    throw new Error(`${version} is not greater than the latest release ${latest}: electron-updater would not offer it, raise the run number of release.yml or release by hand with a greater version`)
}

const stampVersion = (packagePath, version) => {
  if (!versionPattern.test(version)) throw new Error(`${version} is not a version like 26.10.14`)

  const packageInfo = JSON.parse(readFileSync(packagePath, 'utf8'))
  writeFileSync(packagePath, `${JSON.stringify({ ...packageInfo, version }, undefined, 2)}\n`)
}

const releaseNotes = {
  en: 'Bug fixes and improvements.',
  hu: 'Hibajavítások és fejlesztések.'
}

// the software centre of the Flatpak shows the release entry of the metainfo as the changelog of the version: its version and date, and its description, which would
// otherwise read "no details for this release". The notes are generic, as the ones of the Microsoft Store; the details link leads to the changes of the version
const stampMetainfo = (metainfoPath, version, date, repository) => {
  const release = [
    `<release version="${version}" date="${date.toISOString().slice(0, 10)}">`,
    `      <description>`,
    ...Object.entries(releaseNotes).map(([language, text]) => `        <p${language === 'en' ? '' : ` xml:lang="${language}"`}>${text}</p>`),
    `      </description>`,
    `      <url type="details">https://github.com/${repository}/releases/tag/v${version}</url>`,
    `    </release>`
  ].join('\n')

  writeFileSync(metainfoPath, readFileSync(metainfoPath, 'utf8').replace(/<release [\s\S]*?(?:\/>|<\/release>)/, release))
}

if (require.main === module) {
  const [first, latest] = process.argv.slice(2)
  const checkLatest = first === '--after'
  const [version] = checkLatest ? [] : [first]
  if (version) {
    const packagePath = resolve(__dirname, '../../package.json')
    stampVersion(packagePath, version)
    const { build } = JSON.parse(readFileSync(packagePath, 'utf8'))
    stampMetainfo(resolve(__dirname, `../../packaging/flatpak/${build.appId}.metainfo.xml`), version, new Date(), `${build.publish.owner}/${build.publish.repo}`)
  }
  else if (!process.env.GITHUB_RUN_NUMBER) throw new Error('GITHUB_RUN_NUMBER is not set')
  else {
    const created = createVersion(new Date(), process.env.GITHUB_RUN_NUMBER)
    if (checkLatest) assertNewer(created, latest)
    console.log(created)
  }
}

module.exports = { assertNewer, compareVersions, createVersion, stampMetainfo, stampVersion, versionPattern }
