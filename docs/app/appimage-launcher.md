# The AppImage launcher entry

`syncLauncher` in `electron/services/app-image-launcher.ts` keeps an enabled desktop entry working:

- it points to the running AppImage when the one it started was moved;
- it goes away when that one is gone and the app does not run from an AppImage;
- an entry of the running AppImage is rewritten when its content or icons changed with the version;
- an entry that still works for another AppImage is left alone.
