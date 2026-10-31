import { existsSync, readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const { build, license, homepage } = JSON.parse(read('package.json'))
const en = JSON.parse(read('locales/en.json'))
const hu = JSON.parse(read('locales/hu.json'))
const metainfo = read(`flatpak/${build.appId}.metainfo.xml`)
const desktop = read(`flatpak/${build.appId}.desktop`)
const desktopValue = key => desktop.split('\n').find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
const pagesUrl = `https://${homepage.split('/')[3].toLowerCase()}.github.io/${homepage.split('/')[4]}/`

// Flathub takes the app from these files (see flatpak/), so they have to stay in step with the app they describe
describe('the desktop entry of the Flatpak', () => {
  it('starts the executable of the package under the window class the app opens with', () => {
    expect(desktopValue('Exec')).toBe(build.linux.executableName)
    expect(desktopValue('StartupWMClass')).toBe(build.productName)
  })

  it('names the icon after the app id, which the icons of the package are installed under', () => {
    expect(desktopValue('Icon')).toBe(build.appId)
  })

  it('describes the app in the languages of the app', () => {
    expect(desktopValue('Comment')).toBe(en['app.description'])
    expect(desktopValue('Comment[hu]')).toBe(hu['app.description'])
  })
})

describe('the metainfo of the Flatpak', () => {
  it('has the app id of the package and the desktop entry that belongs to it', () => {
    expect(metainfo).toContain(`<id>${build.appId}</id>`)
    expect(metainfo).toContain(`<launchable type="desktop-id">${build.appId}.desktop</launchable>`)
  })

  it('states the licence of the package', () => {
    expect(metainfo).toContain(`<project_license>${license}</project_license>`)
  })

  it('points to the website of the project', () => {
    expect(metainfo).toContain(`<url type="homepage">${pagesUrl}</url>`)
    expect(metainfo).toContain(`<url type="vcs-browser">${homepage}</url>`)
  })

  it('shows screenshots that the website publishes', () => {
    const images = [...metainfo.matchAll(/<image [^>]*>([^<]+)<\/image>/g)].map(([, url]) => url)

    expect(images.length).toBeGreaterThan(0)
    images.forEach(url => {
      expect(url.startsWith(`${pagesUrl}screenshots/`)).toBe(true)
      expect(existsSync(new URL(`../site/${url.slice(pagesUrl.length)}`, import.meta.url))).toBe(true)
    })
  })

  it('has a release', () => {
    expect(metainfo).toMatch(/<release version="\d+\.\d+\.\d+" date="\d{4}-\d{2}-\d{2}"\/>/)
  })
})
