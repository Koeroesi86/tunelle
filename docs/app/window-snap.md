# Dragging the window to the top edge on Windows

- Symptom: on Windows, dragging the title bar to the top edge of the screen (Aero Snap) did not maximize the window.
- Cause: the window is frameless (`frame: false`), and with `transparent: true` Electron creates it without the native resize frame (`WS_THICKFRAME`), which Windows needs for snapping.
- Fix: the window is never transparent on Windows (`isWindowTransparent` in `electron/windows/window-backdrop.ts`).
  - Windows 11 22H2 or later: `setBackgroundMaterial('acrylic')` blurs behind the window and the window background is clear, so the page shows its translucent panels (the page learns it through `--window-blur`).
  - Windows 10 and the first Windows 11: no backdrop. The window has the solid background of the theme (`#1f1f1f` dark, `#f2f2f2` light, the `--app-background` of `ThemeProvider.scss`), the page gets `--window-opaque` (`electronAPI.opaque`) and the **Window blur** setting is not shown, as there is nothing to blur.
- The rounded corners of the page (`PlayerHome.scss`) stay; Windows 11 rounds a frameless window with a frame on its own.
- Check (not tried on a Windows system yet): drag the title bar to the top edge (maximizes), to a side (half screen), press Win+Up, and on Windows 11 see the blur behind the translucent panels.
