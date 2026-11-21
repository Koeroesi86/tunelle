# Software rendering (no GPU)

A machine with no GPU, or one whose driver Chromium does not use, draws the window in software. The compositor then pays for every translucent pixel, and the canvas of the spectrum is drawn by the CPU. The app notices this when it opens the window and does less.

## The detection (`electron/windows/gpu-acceleration.ts`)

`hasGpuAcceleration()` is true when `app.getGPUFeatureStatus()` reports both `gpu_compositing` and `2d_canvas` as `enabled…` (`enabled`, `enabled_on`, `enabled_force`). `disabled_software`, `unavailable_software` and `disabled_off` (`--disable-gpu`) are software.

The status says `disabled_software` until a page has been drawn, as the GPU process starts with the first one (also with `app.whenReady()`, `getGPUInfo` and a window that is created but has not loaded). The first version of the check read it before the window existed and took every machine for one with no GPU. So the check opens a hidden window with a small page, reads the status when it has loaded and closes it, once for the run (about 70 to 90 ms, and the window of the app opens on a GPU process that runs already). A probe that fails counts as a GPU. The probe window is the only one at that time, and Electron quits when the last window closes and no `window-all-closed` listener exists, so the probe adds an empty one (the app's own is registered after the start); without it the app ended with `ERR_FAILED` loading `tunelle://app/index.html`. `createWindow` and the acrylic material of Windows (`index.ts`) wait for the answer; a change of the GPU needs a restart.

`TUNELLE_GPU=0` forces the software mode, `TUNELLE_GPU=1` forces the accelerated one, anything else asks the GPU. Try the mode on a machine that has a GPU with `TUNELLE_GPU=0 npm run dev`. The end to end tests set `TUNELLE_GPU=1`, as the runners have no GPU and the tests run the app as a user with a GPU sees it.

## What changes

| Part | Software mode |
|---|---|
| The window (`create-window.ts`) | not `transparent`, with the background colour of the theme (`#1f1f1f` dark, `#f2f2f2` light); no macOS vibrancy and no acrylic on Windows |
| The page is told | the argument `--software-rendering` (`softwareArgument`), read by the preload as `electronAPI.software`, and `capabilities.software` of the backend |
| Motion | `data-reduce-motion` is set on the root element like the setting Reduce motion does (`containers/layout/theme-provider`), so the bars of the spectrum and the transitions stop; the setting itself is not changed |
| Blur | the panels are never translucent (`blurred` is false), and the setting Window blur is not shown |

## The colours of the spectrum

`AudioSpectrum` reads `--spectrum-cap` and `--spectrum-meter` with `getComputedStyle` once and again after `data-theme` or `style` of the root element change (a `MutationObserver`), not for each frame: forcing a style recalculation 30 times a second is work the canvas does not need.

## Not checked

The probe was run with the `electron` binary (AMD and NVIDIA GPUs, Wayland, `--no-sandbox`): `enabled` / `enabled`, and `disabled_software` with `--disable-gpu`. macOS and Windows are not checked.
