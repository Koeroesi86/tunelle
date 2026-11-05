// the theme follows the system until the visitor picks one with the button in the top bar; the choice is kept in this browser
const themes = ['system', 'light', 'dark']
// the labels are written into the script tag in the language of the page
const labels = { ...document.currentScript.dataset }
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
    button.textContent = labels[current]
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
