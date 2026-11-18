const { writeFileSync } = require('fs')
const { resolve } = require('path')
const sharp = require('sharp')

// usage: node scripts/tooling/generate-social-preview.js    (npm run social-preview)
// writes site/social-preview.png, the 1280x640 picture that link previews and the repository (Settings, Social preview) show: the icon and the home screenshot
// See docs/development/website.md.
const site = resolve(__dirname, '../..', 'site')
const width = 1280
const height = 640
const background = '#14110f'
const shotWidth = 800
const shotHeight = 500
const corner = 18

const roundedMask = Buffer.from(`<svg width="${shotWidth}" height="${shotHeight}"><rect width="${shotWidth}" height="${shotHeight}" rx="${corner}" ry="${corner}"/></svg>`)

const generate = async () => {
  const shot = await sharp(resolve(site, 'screenshots/home.webp'))
    .resize(shotWidth, shotHeight, { fit: 'cover', position: 'left top' })
    .composite([{ input: roundedMask, blend: 'dest-in' }])
    .png()
    .toBuffer()
  const icon = await sharp(resolve(site, 'icon-512.png')).resize(240, 240).png().toBuffer()

  return sharp({ create: { width, height, channels: 4, background } })
    .composite([
      { input: icon, left: 70, top: 200 },
      { input: shot, left: width - shotWidth - 50, top: 70 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

if (require.main === module) generate().then((png) => writeFileSync(resolve(site, 'social-preview.png'), png))

module.exports = { generate }
