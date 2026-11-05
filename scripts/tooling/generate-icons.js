const { mkdirSync, writeFileSync } = require('fs')
const { resolve } = require('path')
const sharp = require('sharp')

const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
// the logos of the Windows Store package (the tiles, the list and the taskbar, with the sizes the system picks from), by the names its manifest uses
const appxSquares = {
  'StoreLogo.png': 50,
  'Square44x44Logo.png': 44,
  'Square150x150Logo.png': 150,
  ...Object.fromEntries([16, 24, 32, 48, 256].flatMap((size) => [`Square44x44Logo.targetsize-${size}.png`, `Square44x44Logo.targetsize-${size}_altform-unplated.png`].map((name) => [name, size])))
}
const appxWide = { name: 'Wide310x150Logo.png', width: 310, height: 150 }
const icnsTypes = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' }

// ICO directory entries store 256 as 0 and point at PNG-compressed images
function createIco (images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const firstImageOffset = header.length + images.length * 16
  const entries = images.map(({ size, data }, index) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size % 256, 0)
    entry.writeUInt8(size % 256, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(firstImageOffset + images.slice(0, index).reduce((sum, image) => sum + image.data.length, 0), 12)
    return entry
  })

  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)])
}

// ICNS is a big-endian chunk container, every chunk holds a PNG image
function createIcns (images) {
  const chunks = images.map(({ type, data }) => {
    const chunkHeader = Buffer.alloc(8)
    chunkHeader.write(type, 0, 'ascii')
    chunkHeader.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([chunkHeader, data])
  })
  const fileHeader = Buffer.alloc(8)
  fileHeader.write('icns', 0, 'ascii')
  fileHeader.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)

  return Buffer.concat([fileHeader, ...chunks])
}

// the wide tile has the icon of the square tile on a transparent ground
async function createAppxWide (input) {
  const { width, height } = appxWide

  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(input).resize(height, height).png().toBuffer(), gravity: 'centre' }])
    .png()
    .toBuffer()
}

async function generateIcons (input, output) {
  const resized = new Map(await Promise.all(
    pngSizes.map(async (size) => [size, await sharp(input).resize(size, size).png().toBuffer()])
  ))

  mkdirSync(resolve(output, 'icons/png'), { recursive: true })
  mkdirSync(resolve(output, 'icons/win'), { recursive: true })
  mkdirSync(resolve(output, 'icons/mac'), { recursive: true })
  mkdirSync(resolve(output, 'icons/appx'), { recursive: true })

  pngSizes.forEach((size) => writeFileSync(resolve(output, `icons/png/${size}x${size}.png`), resized.get(size)))
  writeFileSync(resolve(output, 'icons/win/icon.ico'), createIco(icoSizes.map((size) => ({ size, data: resized.get(size) }))))
  writeFileSync(
    resolve(output, 'icons/mac/icon.icns'),
    createIcns(Object.entries(icnsTypes).map(([size, type]) => ({ type, data: resized.get(Number(size)) })))
  )

  await Promise.all(
    Object.entries(appxSquares).map(async ([name, size]) => writeFileSync(resolve(output, 'icons/appx', name), await sharp(input).resize(size, size).png().toBuffer()))
  )
  writeFileSync(resolve(output, 'icons/appx', appxWide.name), await createAppxWide(input))
}

module.exports = { createIco, createIcns, generateIcons }
