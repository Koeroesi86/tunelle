# Software rendering (no GPU)

A machine with no GPU, or one whose driver Chromium does not use, draws the window in software. The compositor then pays for every translucent pixel, and the canvas of the spectrum is drawn by the CPU. The app notices this when it opens the window and does less.

## The detection (`electron/windows/gpu-acceleration.ts`)

`detectSoftwareRendering(window)` runs in `index.ts` when the page of the window has loaded. It is software when `app.getGPUFeatureStatus()` does not report both `gpu_compositing` and `2d_canvas` as `enabled…` (`enabled`, `enabled_on`, `enabled_force`; `disabled_software`, `unavailable_software` and `disabled_off` for `--disable-gpu` are software).

It can not run earlier: the status says `disabled_software` until a page was drawn, as the GPU process starts with the first one (also after `app.whenReady()`, `getGPUInfo` and a window that is created but has not loaded). The first version read it before the window existed and took every machine for one with no GPU. A hidden probe window works (about 70 to 90 ms) but delays the splash, so the window opens as it always did and the answer comes after the load.

`TUNELLE_GPU=0` forces the software mode, `TUNELLE_GPU=1` the accelerated one, anything else asks the GPU. Try the mode on a machine that has a GPU with `TUNELLE_GPU=0 npm run dev`. The runners have no GPU, so the end to end tests run in the software mode, which is also faster there; `e2e/functional/software-rendering.spec.ts` forces each mode and checks the page. The perf workflow sets `TUNELLE_GPU=1`, as its numbers are those of the app with the bars and the translucent window.

## What changes

| Part | Software mode |
|---|---|
| The window | the transparency of a window can not change after it is created, so it stays; macOS vibrancy (`setVibrancy(null)`) and the acrylic of Windows (`setBackgroundMaterial('none')`, also not set at `ready-to-show` when this is known by then) go |
| The page is told | the message `SOFTWARE_RENDERING` (`{ software }`), when the detection has run and again with `APP_READY`, kept as `uiState.softwareRendering` (not a setting) |
| Motion | `data-reduce-motion` is set on the root element like the setting Reduce motion does (`containers/layout/theme-provider`), so the bars of the spectrum and the transitions stop; the setting itself is not changed |
| Blur | the panels are never translucent (`blurred` is false; the page has a background of its own, `.opaque.noBlur`), and the setting Window blur is not shown |

The page runs with motion and translucency for the first moments, until the message arrives.

## The colours of the spectrum

`AudioSpectrum` reads `--spectrum-cap` and `--spectrum-meter` with `getComputedStyle` once and again after `data-theme` or `style` of the root element change (a `MutationObserver`), not for each frame: forcing a style recalculation 30 times a second is work the canvas does not need.

## Not checked

Run with the `electron` binary and the built app on Linux (Wayland, AMD and NVIDIA GPUs, `--no-sandbox`): `enabled` / `enabled` after the page loaded, `disabled_software` with `--disable-gpu`. macOS and Windows are not checked.
