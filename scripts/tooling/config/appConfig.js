const appConfig = {
  locals: {
    doctype: '<!DOCTYPE html>',
    title: 'Tunelle',
    // the client bundle is built by a separate compiler, so the static site
    // generator cannot discover it from its own compilation's assets
    assets: {
      client: './client.js',
      loudness: './loudness.js'
    }
  },
  paths: [
    '/loading.html',
    '/loudness.html',
    '/index.html'
  ]
}

module.exports = appConfig
