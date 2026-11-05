const { resolve } = require('path')
const fs = require('fs')
const rimraf = require('rimraf')
const { generateIcons } = require('./generate-icons')

const cwd = resolve(__dirname, '../../')

const bundlePath = resolve(cwd, './build')
if (fs.existsSync(bundlePath)) {
  rimraf.sync(bundlePath)
  console.log('Removed previous build.')
}

generateIcons(resolve(cwd, 'assets/icon.png'), cwd)
  .then(() => console.log('Generated app icons.'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
