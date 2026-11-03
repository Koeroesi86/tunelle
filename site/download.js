// the copy button next to a command; without the clipboard (or this script) the command is still there to select
document.querySelectorAll('[data-copy]').forEach((copy) => {
  if (!navigator.clipboard) return
  copy.hidden = false
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(document.getElementById(copy.dataset.copy).textContent)
    copy.textContent = 'Copied'
  })
})

// marks the download of the visitor's system and points the big button at it; without this script the three systems are all listed
;(async () => {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent
  const system = [
    ['windows', /win/i],
    ['mac', /mac|iphone|ipad/i],
    ['linux', /linux|x11|cros/i],
  ].find(([, pattern]) => pattern.test(platform))?.[0]
  const card = document.querySelector(`[data-system="${system}"]`)
  const button = document.getElementById('download-primary')
  if (!card || !button) return

  // the processor is only known from the high entropy hints (Chromium); macOS reports Intel for every Mac, so it starts with Apple silicon
  const hints = await navigator.userAgentData?.getHighEntropyValues?.(['architecture']).catch(() => undefined)
  const arm = hints ? hints.architecture === 'arm' : system === 'mac'
  const links = card.querySelectorAll('a:not([href^="#"])')
  const [preferred, other] = arm ? [links[1], links[0]] : [links[0], links[1]]

  card.classList.add('detected')
  button.href = preferred.href
  button.textContent = `Download for ${card.querySelector('h3').textContent}`

  // Linux has the Flatpak as the first choice: its button stays in the card and the big button leads to it instead of the AppImage
  if (system === 'linux') {
    button.href = '#flatpak'
    button.textContent = 'Install for Linux'
    return
  }
  preferred.classList.add('button')
  other.classList.remove('button')
})()
