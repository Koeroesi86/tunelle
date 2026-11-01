import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createIcns, createIco, generateIcons } from './generate-icons'

const png = Buffer.from('png')

describe('createIco', () => {
  it('writes the directory with the image offsets and stores 256 as 0', () => {
    const ico = createIco([{ size: 16, data: png }, { size: 256, data: png }])

    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
    expect(ico.readUInt8(6)).toBe(16)
    expect(ico.readUInt8(22)).toBe(0)
    expect(ico.readUInt32LE(18)).toBe(38)
    expect(ico.readUInt32LE(34)).toBe(41)
    expect(ico.subarray(38).toString()).toBe('pngpng')
  })
})

describe('createIcns', () => {
  it('writes the total length and a typed chunk per image', () => {
    const icns = createIcns([{ type: 'icp4', data: png }, { type: 'ic07', data: png }])

    expect(icns.subarray(0, 4).toString()).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(icns.length)
    expect(icns.subarray(8, 12).toString()).toBe('icp4')
    expect(icns.readUInt32BE(12)).toBe(11)
    expect(icns.subarray(19, 23).toString()).toBe('ic07')
  })
})

describe('generateIcons', () => {
  let output

  afterEach(() => rmSync(output, { recursive: true, force: true }))

  it('writes the png, ico and icns icons and the logos of the Store package', async () => {
    output = mkdtempSync(resolve(tmpdir(), 'icons-'))

    await generateIcons(resolve(__dirname, '../assets/icon.png'), output)

    expect(readFileSync(resolve(output, 'icons/png/1024x1024.png')).subarray(1, 4).toString()).toBe('PNG')
    expect(readFileSync(resolve(output, 'icons/win/icon.ico')).readUInt16LE(4)).toBe(7)
    expect(readFileSync(resolve(output, 'icons/mac/icon.icns')).subarray(0, 4).toString()).toBe('icns')
    // the logos of the Store package, with the sizes the manifest and the system ask for
    const appx = (name) => readFileSync(resolve(output, 'icons/appx', name))
    expect(['StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png', 'Square44x44Logo.targetsize-24_altform-unplated.png'].every((name) => appx(name).subarray(1, 4).toString() === 'PNG')).toBe(true)
    expect(appx('Wide310x150Logo.png').readUInt32BE(16)).toBe(310)
    expect(appx('Wide310x150Logo.png').readUInt32BE(20)).toBe(150)
    expect(appx('Square150x150Logo.png').readUInt32BE(16)).toBe(150)
    // it resizes the image to every size of the icons, which took 6 s on a slow Windows runner, over the 5 s of the default
  }, 30000)
})
