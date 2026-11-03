const { execFileSync } = require('child_process')
const { readdirSync } = require('fs')
const { resolve } = require('path')

// usage: node scripts/zsync.js
// writes the zsync file next to each AppImage in dist/ (zsyncmake from the zsync package): the update information in the AppImage (scripts/appimage-update-info.js)
// names it, and AppImageUpdate and appimageupdatetool (which AM runs) download only what changed with it; its URL is the name of the AppImage, which they
// resolve next to the zsync file in the release
const dist = resolve(__dirname, '..', 'dist')

readdirSync(dist)
  .filter(name => name.endsWith('.AppImage'))
  .forEach(name => execFileSync('zsyncmake', ['-u', name, name], { cwd: dist, stdio: 'inherit' }))
