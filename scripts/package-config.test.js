import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const { build } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// scripts/dist.js passes the architecture of the runner: a fixed one in the target made the Windows ARM runner build x64 as well, and
// a combined installer without an architecture in its name that ended up in the release
describe('packaging targets', () => {
  it.each(['win', 'mac', 'linux'])('leaves the architecture of %s to the runner', platform => {
    expect(JSON.stringify(build[platform].target)).not.toContain('"arch"')
  })
})

// electron-builder gives x64 10.0.14316.0 (a preview build that MSIX does not run on) and arm64 10.0.16299.0 (Windows 10 1709, the first
// that installs MSIX): one version for both, so the Store lists the same systems for each package
describe('Store package', () => {
  it('names the same lowest Windows version for every architecture, one that installs MSIX', () => {
    expect(build.appx.minVersion).toBe('10.0.16299.0')
  })
})
