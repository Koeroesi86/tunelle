# The Flatpak repository

`node scripts/release/flatpak-repo.js <bundles folder> <repo folder>` builds the Flatpak repository (OSTree, static files) from the `*.flatpak` bundles of a release, and signs the commits and the summary with the key in `FLATPAK_GPG_PRIVATE_KEY` (armored, no passphrase). Without a usable key it fails: an unsigned repository is never written.

The repository only holds the bundles it was given, so it is built again from the latest release instead of being carried from one release to the next. The `.flatpakrepo` and `.flatpakref` next to it are what `flatpak remote-add` and `flatpak install` read. The runtime comes from Flathub (`RuntimeRepo`).

The install commands are in [install.md](install.md).
