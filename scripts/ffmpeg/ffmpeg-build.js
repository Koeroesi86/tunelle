const { spawnSync } = require('child_process')
const { createHash } = require('crypto')
const { mkdirSync } = require('fs')
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

const build = async work => {
  checkFlags(source)
  mkdirSync(work, { recursive: true })
  const response = await fetch(source.url)
  if (!response.ok) throw new Error(`Downloading ${source.url} failed (${response.status})`)
  const tarball = Buffer.from(await response.arrayBuffer())
  checkTarball(tarball, source.sha256)
  // the verified bytes go to tar on stdin, so no downloaded file is written by this script
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
  build(resolve(process.argv[2] || 'ffmpeg-work')).catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = { checkBinary, checkFlags, checkTarball, posixPath, sha256Of, toolchainFlags }
