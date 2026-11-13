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

## Not covered by the tests

The unit tests check the logic (the breakpoints, the drawer, the bounds, the props of the components). A stylesheet is stubbed in them, so whether a layout overflows or clips is not tested. Check it by hand: `npm run build`, start the app, resize the window to 360 px wide and 480 px high, and go through every page at 100%, 150% and 200% zoom (`Ctrl` and `+`). The end to end spec (`e2e/responsive.spec.ts`) that opens each page at the three sizes and asserts there is no horizontal overflow is still to be written.
