const { execFileSync } = require('child_process')
const { mkdtempSync, readdirSync, rmSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

// usage: node scripts/flatpak-repo.js <bundles folder> <repo folder>
// builds the Flatpak repository (OSTree, static files) from the *.flatpak bundles of a release and signs the commits and the summary with the key in
// FLATPAK_GPG_PRIVATE_KEY (armored, no passphrase); without a usable key it fails, an unsigned repository is never written. The repository only
// holds the bundles it was given, so it is built again from the latest release instead of being carried from one release to the next, and the
// .flatpakrepo and .flatpakref next to it are what `flatpak remote-add` and `flatpak install` read. The runtime comes from Flathub (RuntimeRepo)
const siteUrl = 'https://koeroesi86.github.io/tunelle/'
const repoUrl = `${siteUrl}repo/`
const appId = 'io.github.koeroesi86.Tunelle'
const flathubRepoUrl = 'https://dl.flathub.org/repo/flathub.flatpakrepo'
// what the software centre shows of the .flatpakref before the app is installed (the metainfo of the app is not read from it): the summary and the
// first paragraph of the description of flatpak/<appId>.metainfo.xml, and the icon of the website
const comment = 'Lossless audio player'
const description = 'Tunelle plays your own music library and internet radio, and shows the format of everything it plays: FLAC 16/44.1, FLAC 24/96, MP3 320.'
const iconUrl = `${siteUrl}icon-512.png`

// the first secret key of `gpg --list-secret-keys --with-colons`: sec:<validity>:::::<expires>:::::: and the fpr: line after it
const findKey = (listing, now = Date.now()) => {
  const lines = listing.split('\n').map((line) => line.split(':'))
  const secret = lines.find(([type]) => type === 'sec')
  const fingerprint = lines.find(([type]) => type === 'fpr')?.[9]
  if (!secret || !fingerprint) throw new Error('FLATPAK_GPG_PRIVATE_KEY has no secret key')

  const [, validity, , , , , expires] = secret
  const expired = Boolean(expires) && Number(expires) * 1000 <= now
  if (expired || /[erd]/.test(validity)) throw new Error(`the signing key ${fingerprint} is expired, revoked or disabled`)
  return fingerprint
}

// the branch of the app in the bundles (build.flatpak.branch of package.json), from the refs of the repository, so the bundles of a release that was built
// with another branch are published under theirs
const findBranch = (refs) => {
  const branches = [...new Set(refs.split('\n').filter((ref) => ref.startsWith(`app/${appId}/`)).map((ref) => ref.split('/')[3]))]
  if (branches.length !== 1) throw new Error(`the bundles have to share one branch of ${appId}, found: ${branches.join(', ') || 'none'}`)
  return branches[0]
}

const repoFile = (publicKey, branch) =>
  [
    '[Flatpak Repo]',
    'Title=Tunelle',
    `Comment=${comment}`,
    `Description=${description}`,
    `Icon=${iconUrl}`,
    `Url=${repoUrl}`,
    `Homepage=${siteUrl}`,
    `DefaultBranch=${branch}`,
    `GPGKey=${publicKey}`,
    '',
  ].join('\n')

const refFile = (publicKey, branch) =>
  [
    '[Flatpak Ref]',
    'Title=Tunelle',
    `Name=${appId}`,
    `Comment=${comment}`,
    `Description=${description}`,
    `Icon=${iconUrl}`,
    `Branch=${branch}`,
    `Url=${repoUrl}`,
    'SuggestRemoteName=tunelle',
    'IsRuntime=false',
    `RuntimeRepo=${flathubRepoUrl}`,
    `Homepage=${siteUrl}`,
    `GPGKey=${publicKey}`,
    '',
  ].join('\n')

const run = (command, args, options) => execFileSync(command, args, { stdio: ['pipe', 'pipe', 'inherit'], ...options })

const buildRepo = (bundlesFolder, repoFolder, privateKey) => {
  if (!privateKey) throw new Error('FLATPAK_GPG_PRIVATE_KEY is not set')
  const bundles = readdirSync(bundlesFolder).filter((name) => name.endsWith('.flatpak')).map((name) => join(bundlesFolder, name))
  if (!bundles.length) throw new Error(`no .flatpak bundle in ${bundlesFolder}`)

  const gpgHome = mkdtempSync(join(tmpdir(), 'tunelle-gpg-'))
  try {
    run('gpg', ['--homedir', gpgHome, '--batch', '--import'], { input: privateKey })
    const fingerprint = findKey(run('gpg', ['--homedir', gpgHome, '--list-secret-keys', '--with-colons']).toString())
    const publicKey = run('gpg', ['--homedir', gpgHome, '--export', fingerprint])
    const publicKeyFile = join(gpgHome, 'public.gpg')
    writeFileSync(publicKeyFile, publicKey)

    rmSync(repoFolder, { recursive: true, force: true })
    const sign = [`--gpg-sign=${fingerprint}`, `--gpg-homedir=${gpgHome}`]
    run('ostree', ['init', `--repo=${repoFolder}`, '--mode=archive-z2'])
    bundles.forEach((bundle) => run('flatpak', ['build-import-bundle', ...sign, repoFolder, bundle]))
    const branch = findBranch(run('ostree', ['refs', `--repo=${repoFolder}`]).toString())
    run('flatpak', [
      'build-update-repo',
      ...sign,
      `--gpg-import=${publicKeyFile}`,
      '--title=Tunelle',
      `--homepage=${siteUrl}`,
      `--default-branch=${branch}`,
      '--generate-static-deltas',
      '--prune',
      repoFolder,
    ])
    writeFileSync(join(repoFolder, 'tunelle.flatpakrepo'), repoFile(publicKey.toString('base64'), branch))
    writeFileSync(join(repoFolder, 'tunelle.flatpakref'), refFile(publicKey.toString('base64'), branch))
  } finally {
    rmSync(gpgHome, { recursive: true, force: true })
  }
}

if (require.main === module) {
  const [bundlesFolder, repoFolder] = process.argv.slice(2)
  if (!bundlesFolder || !repoFolder) {
    console.error('usage: node scripts/flatpak-repo.js <bundles folder> <repo folder>')
    process.exit(1)
  }
  try {
    buildRepo(bundlesFolder, repoFolder, process.env.FLATPAK_GPG_PRIVATE_KEY)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

module.exports = { comment, description, findBranch, findKey, refFile, repoFile }
