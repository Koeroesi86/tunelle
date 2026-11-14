import type { Input, WebContents } from 'electron';

/** The steps of the zoom as factors, 100% is the start: 200% is 600 CSS px in a 1200 px window and 300% the compact layout. See docs/development/accessibility.md */
export const zoomFactors = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const startIndex = zoomFactors.indexOf(1);

/** The step a key asks for from the current one: plus and minus move it, zero is back to 100%, anything else is not a zoom key */
export const nextZoomIndex = (input: Pick<Input, 'type' | 'key' | 'control' | 'meta' | 'alt'>, index: number) => {
  if (input.type !== 'keyDown' || input.alt || !(input.control || input.meta)) return undefined;
  if (input.key === '+' || input.key === '=') return Math.min(index + 1, zoomFactors.length - 1);
  if (input.key === '-' || input.key === '_') return Math.max(index - 1, 0);
  return input.key === '0' ? startIndex : undefined;
};

/** Ctrl or Cmd with plus, minus and zero zoom the page, as the window has no menu that would */
function registerWindowZoom(webContents: WebContents) {
  let index = startIndex;
  webContents.on('before-input-event', (event, input) => {
    const next = nextZoomIndex(input, index);
    if (next === undefined) return;

    event.preventDefault();
    index = next;
    webContents.setZoomFactor(zoomFactors[index]);
  });
}

export default registerWindowZoom;
