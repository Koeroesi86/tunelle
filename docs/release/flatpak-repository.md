# The Flatpak repository

`node scripts/release/flatpak-repo.js <bundles folder> <repo folder>` builds the Flatpak repository (OSTree, static files) from the `*.flatpak` bundles of a release, and signs the commits and the summary with the key in `FLATPAK_GPG_PRIVATE_KEY` (armored, no passphrase). Without a usable key it fails: an unsigned repository is never written.

The repository only holds the bundles it was given, so it is built again from the latest release instead of being carried from one release to the next. The `.flatpakrepo` and `.flatpakref` next to it are what `flatpak remote-add` and `flatpak install` read. The runtime comes from Flathub (`RuntimeRepo`).

`pages.yml` builds it with `flatpak`, `ostree` and `gnupg` from apt, whose package list pulls in about 60 packages. The mirror of the runner has been slow (16 MB took 11 minutes 42 seconds at 23 kB/s in the run of release 26.11.19, the step took 12 of the 13 minutes of the deployment), so the downloads are kept in `~/apt-archives` between runs, the way the Flatpak job of `dist.yml` does it: the first install does not update the package lists and the update is the fallback when a package is gone from the mirror, and the cache is saved also when the install fails, so the next run continues with what was downloaded. The key has the image of the runner (`ImageOS`) and the architecture, as the downloads of one release of Ubuntu do not fit another.

The install commands are in [install.md](../install.md).
