// the theme follows the system until the visitor picks one with the button in the top bar; the choice is kept in this browser
const themes = ['system', 'light', 'dark']
// the labels are written into the script tag in the language of the page
const labels = { ...document.currentScript.dataset }
// the icon of the current choice: a screen for the system, a sun, a moon
const icons = {
  system: '<path d="M3 5h18v11H3zM8 21h8M12 16v5" />',
  light: '<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />',
  dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />',
}
const read = () => {
  try {
    return localStorage.getItem('theme')
  } catch {
    return undefined
  }
}
const apply = (theme) => {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.dataset.theme = theme
}

let current = themes.includes(read()) ? read() : 'system'
apply(current)

// the script sits in the head to set the theme before the first paint, so the button is wired once the page is parsed
document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('theme-toggle')
  if (!button) return
  const show = () => {
    button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[current]}</svg>`
    button.title = labels[current]
    button.setAttribute('aria-label', labels[current])
    button.hidden = false
  }
  button.addEventListener('click', () => {
    current = themes[(themes.indexOf(current) + 1) % themes.length]
    apply(current)
    show()
    try {
      if (current === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', current)
    } catch {
      // the choice then only lasts for this visit
    }
  })
  show()
})
