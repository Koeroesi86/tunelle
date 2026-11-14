# Responsive layout

The window is frameless and resizable, so the UI has to work from a small window up to an ultrawide display, at 100% to 200% zoom, with mouse, keyboard and touch. The tracking issue is #356.

## Sizes

| Size     | Window width   | Navigation                                          | Player bar                                        |
| -------- | -------------- | --------------------------------------------------- | ------------------------------------------------- |
| compact  | below 600 px   | a drawer over the content, opened from the title bar | mini player: track, previous, play, next, seek bar |
| medium   | 600 to 1023 px | a 64 px column of icons                             | the full bar                                      |
| expanded | 1024 px and up | the 200 px sidebar                                  | the full bar                                      |

The numbers are in two places that a test keeps equal: `client/styles/breakpoints.scss` (mixins `compact`, `medium`, `below-expanded`, `expanded`) and `client/constants/breakpoints.ts` (`getBreakpoint`, used by the `useBreakpoint` hook in `client/hooks/use-breakpoint.ts`). Change both, never one.

Use a media query (the mixins) for what depends on the window, and a container query (`@container`, as in the radio stations and now playing pages) for what depends on the room a component has. `useBreakpoint` is for what changes the markup (the drawer and the menu button in `PlayerHome`, the icon column of `Navigation`); it renders again only when a breakpoint is crossed, not for each resize event.

## Minimum window size

`electron/windows/window-bounds.ts` holds `minWindowSize` (360 x 480), which `create-window.ts` gives to the `BrowserWindow`, and `correctWindowBounds`, which fixes the bounds that `electron-window-state` saved before the window opens: a size below the minimum is raised, a size larger than its display is shrunk, a window that sticks out of its display is moved in, and a window that no display shows (100 x 50 px at least) is centered on the primary display. A display that was unplugged or changed its resolution is the usual cause.

## Rules

- **Widths are fluid.** `rem`, `clamp()`, `min()` and `repeat(auto-fill, minmax(min(100%, Npx), 1fr))`, not a fixed pixel width that is wider than the compact window (360 px).
- **Columns give way, the title does not.** A list drops the secondary columns first (album, year and format of the track list, and the date and details of the favourites), then the artist; the title takes what is left.
- **Hover is never the only way.** What shows on hover is hidden with `@include hover-hidden`, which hides it only where a pointer hovers (`@media (hover: hover)`), so a touch screen shows it. A keyboard reaches it with `:focus-visible` and `:focus-within`.
- **A touch target is 44 px** (`$touch-target`) under `@include touch` (`pointer: coarse`) and in the compact player bar. A small button gets the area through an `::after` of 44 px, so the row does not grow (the rows of the long lists have a fixed height, see `use-windowed-list.ts`).
- **A short window scrolls the content.** The title bar and the player bar keep their height, and the pages scroll inside the tab.
- **Ultrawide.** From 1840 px (`$content-max` plus the sidebar) a page is centered with a width of at most 1600 px (`PlayerTabs.scss`).
- **Dialogs** (the album details) take the window in the compact size: `max-width: calc(100vw - 16px)`.

## Checking the layout

The unit tests check the logic (the breakpoints, the drawer, the bounds, the props of the components). A stylesheet is stubbed in them, so whether a layout overflows or clips is not tested there. `e2e/screenshots/small-windows.spec.ts` does, on the built app (`npm run build`, then `npm run screenshots -- small-windows`):

- every page (home, now playing, radio, liked, equalizer, settings, albums, songs) and the album dialog at a compact (390 x 844), a medium (800 x 600), an expanded (1360 x 850) and an ultrawide (2560 x 1080) window. Each is checked (no element is drawn past the edge of the window unless a box that scrolls holds it, and the play and next buttons are what a click at their middle reaches) and its picture is taken;
- the window turning from landscape to portrait and back (900 x 520, 520 x 640, 360 x 480) with a list scrolled (the scroll position stays) and the album dialog open (it stays open, fits the window, and the track keeps playing).

It belongs to the `screenshots` project, not to `e2e`, so CI does not run it: a person runs it after a change of the layout and looks at the pictures in `.cache/responsive-layout/` (`SCREENSHOTS_OUT` writes elsewhere). It shares the app, the library and the steps with the pictures of the website through `e2e/screenshots/screenshot-steps.ts`. The pictures are not in `site/screenshots/`, as the website does not show the app on a small screen.

What it does not do: a touch screen (`pointer: coarse` and `hover: none` are not emulated), zoom and a large system font, and a window moved between displays of different density. Check these by hand.

Findings from the first run: the clock of the player has to be held (`holdAt`), or the picture is never the same twice; the page of an album takes the library area only (the player bar stays), and the buttons are checked as everywhere; a window that is taller than its list shows all of it, so the portrait size of the scroll test is kept low on purpose.
