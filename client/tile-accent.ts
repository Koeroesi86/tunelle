/** The shadow of a tile at rest and while the pointer is over it, as the cover colour with the alpha of the shadow (`#rrggbbaa`) */
const alphas = { '--tile-shadow': '8c', '--tile-shadow-hover': 'cc' };

/** Gives a tile the colour of its cover for its shadow; a tile without one (the colour is not picked yet, or the cover is grey) keeps the dark shadow of the theme */
export const tileAccent = (accent: string | undefined) => (element: HTMLElement | null) =>
  Object.entries(alphas).forEach(([name, alpha]) => element?.style.setProperty(name, accent ? `${accent}${alpha}` : ''));
