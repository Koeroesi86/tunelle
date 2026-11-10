const { spawnSync } = require('child_process')
const { createHash } = require('crypto')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs')
const { join, resolve } = require('path')
const source = require('./ffmpeg-source.json')

const sha256Of = buffer => createHash('sha256').update(buffer).digest('hex')

// the build is refused unless the tarball is the pinned one
const checkTarball = (buffer, expected) => {
  const actual = sha256Of(buffer)
  if (actual !== expected) throw new Error(`The ffmpeg source has sha256 ${actual}, expected ${expected}`)
}

// the configure flags must not switch on a GPL, version 3 or non-free part
const checkFlags = ({ configure, forbidden }) => {
  const found = configure.filter(flag => forbidden.includes(flag))
  if (found.length > 0) throw new Error(`Forbidden configure flags: ${found.join(' ')}`)
}

// the configuration a built binary reports must be the LGPL one, with the decoders of the list and no more
const checkBinary = (versionOutput, decoderOutput, { forbidden, decoders }) => {
  const found = forbidden.filter(flag => versionOutput.includes(flag))
  if (found.length > 0) throw new Error(`The binary was built with ${found.join(' ')}`)
  if (!/--disable-gpl/.test(versionOutput)) throw new Error('The binary does not report --disable-gpl')
  const listed = decoderOutput
    .split('\n')
    .map(line => line.match(/^\s*A\S*\s+([^\s=]\S*)\s/))
    .filter(Boolean)
    .map(match => match[1])
    .sort()
  const expected = [...decoders].sort()
  if (listed.join() !== expected.join()) throw new Error(`The binary decodes ${listed.join(' ')}, expected ${expected.join(' ')}`)
}

// configure under MSYS reads D:\a\x as a host path, so the prefix is /d/a/x there
const posixPath = path => path.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replace(/\\/g, '/')

// MSYS2 has no gcc for Windows on ARM, its packages for that processor are clang ones
const toolchainFlags = (platform, arch) => (platform === 'win32' && arch === 'arm64' ? ['--cc=clang'] : [])

const run = (command, args, options) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`)
}

const output = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`)
  return result.stdout
}

const attempts = 4

// a download that fails on the network, or with a server error, is tried again after a wait that grows (ffmpeg.org drops some of the parallel downloads of the runners);
// any other status is final. The bytes are checked against the sha256 afterwards.
const download = async (url, attempt = 1) => {
  const result = await fetch(url).then(
    async response => (response.status >= 500 || response.status === 429 ? new Error(`Downloading ${url} failed (${response.status})`) : response),
    error => error
  )
  if (result instanceof Response && !result.ok) throw new Error(`Downloading ${url} failed (${result.status})`)
  const body = result instanceof Response ? await result.arrayBuffer().then(Buffer.from, error => error) : result
  if (Buffer.isBuffer(body)) return body
  if (attempt >= attempts) throw body instanceof Error ? body : new Error(`Downloading ${url} failed`)
  console.error(`${body.message}${body.cause ? ` (${body.cause.message ?? body.cause})` : ''}, trying again (${attempt}/${attempts - 1})`)
  await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
  return download(url, attempt + 1)
}

// a tarball kept from an earlier run (the CI cache) is used when it is the pinned one; a downloaded one is kept there after the check
const fetchTarball = async (keep, { url, sha256, version }) => {
  const file = keep && join(keep, `ffmpeg-${version}.tar.xz`)
  const kept = file && existsSync(file) ? readFileSync(file) : undefined
  if (kept && sha256Of(kept) === sha256) return kept
  const tarball = await download(url)
  checkTarball(tarball, sha256)
  if (file) {
    mkdirSync(keep, { recursive: true })
    writeFileSync(file, tarball)
  }
  return tarball
}

const build = async (work, keep) => {
  checkFlags(source)
  mkdirSync(work, { recursive: true })
  const tarball = await fetchTarball(keep, source)
  // the verified bytes go to tar on stdin
  run('tar', ['-xJf', '-'], { cwd: work, input: tarball, stdio: ['pipe', 'inherit', 'inherit'] })
  const tree = join(work, `ffmpeg-${source.version}`)
  const prefix = join(work, 'install')
  run('sh', ['./configure', `--prefix=${posixPath(prefix)}`, ...toolchainFlags(process.platform, process.arch), ...source.configure], { cwd: tree })
  run('make', ['-j', String(require('os').availableParallelism())], { cwd: tree })
  run('make', ['install'], { cwd: tree })
  const binary = join(prefix, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  checkBinary(output(binary, ['-version']), output(binary, ['-hide_banner', '-decoders']), source)
  console.log(`Built ${binary}`)
}

if (require.main === module) {
  build(resolve(process.argv[2] || 'ffmpeg-work'), process.argv[3] && resolve(process.argv[3])).catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = { checkBinary, download, fetchTarball, checkFlags, checkTarball, posixPath, sha256Of, toolchainFlags }
