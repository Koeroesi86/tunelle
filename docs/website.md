# Website

The website is the static page in `site/` (plain HTML, CSS and one small script, no build tooling), published on GitHub Pages by `.github/workflows/pages.yml` when `site/` changes on `master` and after every release.

`scripts/tooling/build-site.js` writes the latest release into a copy of the page while it is deployed (`{{version}}`, `{{notes}}` and `{{asset:<system>-<arch>}}` in `site/index.html`), so the download links follow the release without an edit.

To look at it, run `npm run site` and open <http://localhost:4173/> (`node scripts/tooling/serve-site.js <port>` for another port): it serves `site/` with the latest release written in and reads the files on every request, so an edit shows after a reload.

The install steps are written in [install.md](install.md) and on the page, so change both. Under Settings, Pages, the source has to be **GitHub Actions**.

A change that adds, removes or visibly changes a feature (a page, the player bar, radio, platform support, install steps) updates the matching section of `site/index.html` in the same pull request, and the screenshots when what they show changed, see [screenshots.md](screenshots.md).

The documentation in this folder is read on GitHub and in the editor; it is not published on the website and not translated.
