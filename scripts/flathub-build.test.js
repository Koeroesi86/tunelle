import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { architectureOf, stampRelease, versionOfTag, wrapperScript } from './flathub-build'

const metainfo = readFileSync(new URL('../flatpak/io.github.koeroesi86.Tunelle.metainfo.xml', import.meta.url), 'utf8')

describe('versionOfTag', () => {
  it('drops the v of the tag of a release', () => {
    expect(versionOfTag('v26.10.12')).toBe('26.10.12')
  })
})

describe('stampRelease', () => {
  it('puts the version and the date of the tag into the release entry of the metainfo', () => {
    const stamped = stampRelease(metainfo, '26.11.3', '2026-11-02')

    expect(stamped).toContain('<release version="26.11.3" date="2026-11-02"/>')
    expect(stamped.match(/<release /g)).toHaveLength(1)
  })

  it('fails on a metainfo without a release entry, which Flathub would show as a version that does not exist', () => {
    expect(() => stampRelease('<component/>', '26.11.3', '2026-11-02')).toThrow('no <release> entry')
  })
})

describe('architectureOf', () => {
  it.each([
    ['x86_64', 'x64', '--x64'],
    ['aarch64', 'arm64', '--arm64']
  ])('maps %s to the architecture of electron and electron-builder', (flatpakArch, node, builder) => {
    expect(architectureOf(flatpakArch)).toEqual({ node, builder })
  })

  it('fails on an architecture that has no electron zip in the sources', () => {
    expect(() => architectureOf('i386')).toThrow('i386 is not an architecture')
  })
})

describe('wrapperScript', () => {
  it('starts the app of the prefix through zypak', () => {
    expect(wrapperScript('/app')).toContain('exec zypak-wrapper /app/lib/tunelle/Tunelle')
  })
})
