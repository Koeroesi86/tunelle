import { describe, expect, it } from 'vitest'
import { packagedExecutable, resourcesFolder, storePackage, updateMetadata } from './dist-layout'

describe('packagedExecutable', () => {
  it.each([
    ['linux', 'x64', 'dist/linux-unpacked/Tunelle'],
    ['linux', 'arm64', 'dist/linux-arm64-unpacked/Tunelle'],
    ['darwin', 'x64', 'dist/mac/Tunelle.app/Contents/MacOS/Tunelle'],
    ['darwin', 'arm64', 'dist/mac-arm64/Tunelle.app/Contents/MacOS/Tunelle'],
    ['win32', 'x64', 'dist/win-unpacked/Tunelle.exe'],
    ['win32', 'arm64', 'dist/win-arm64-unpacked/Tunelle.exe']
  ])('finds the app of %s %s', (platform, arch, expected) => {
    expect(packagedExecutable(platform, arch)).toBe(expected)
  })
})

describe('resourcesFolder', () => {
  it.each([
    ['linux', 'arm64', 'dist/linux-arm64-unpacked/resources'],
    ['darwin', 'arm64', 'dist/mac-arm64/Tunelle.app/Contents/Resources'],
    ['win32', 'x64', 'dist/win-unpacked/resources']
  ])('finds the resources of %s %s', (platform, arch, expected) => {
    expect(resourcesFolder(platform, arch)).toBe(expected)
  })
})

describe('updateMetadata', () => {
  it.each([
    ['linux', 'x64', 'dist/latest-linux.yml'],
    ['linux', 'arm64', 'dist/latest-linux-arm64.yml'],
    ['darwin', 'arm64', 'dist/latest-mac.yml'],
    ['win32', 'arm64', 'dist/latest.yml']
  ])('names the update file of %s %s', (platform, arch, expected) => {
    expect(updateMetadata(platform, arch)[0]).toBe(expected)
  })
})

describe('storePackage', () => {
  it.each([
    ['x64', 'Tunelle-26.11.7-x64.appx', true],
    ['arm64', 'Tunelle-26.11.7-arm64.appx', true],
    ['x64', 'Tunelle-26.11.7-arm64.appx', false],
    ['x64', 'Tunelle 26.11.7.appx', false],
    ['x64', 'Tunelle-Setup-26.11.7-x64.exe', false]
  ])('for %s the name %s is %s', (arch, name, expected) => {
    expect(storePackage('win32', arch).test(name)).toBe(expected)
  })

  it('is only for windows', () => {
    expect(storePackage('linux', 'x64')).toBeUndefined()
    expect(storePackage('darwin', 'arm64')).toBeUndefined()
  })
})
