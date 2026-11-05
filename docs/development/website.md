# Website

The website is the static pages in `site/` (plain HTML, CSS and two small scripts), published on GitHub Pages by `.github/workflows/pages.yml` when `site/` changes on `master` and after every release.

## Languages

The pages are templates, `site/templates/index.html` and `privacy.html`, filled at build time with the strings of each language in `site/strings/<tag>.json` (`scripts/tooling/site-pages.js`; the templates and the strings are not published). English is at the root, so its addresses (`/`, `/privacy.html`) never changed, and every other language is a folder: `/hu/`, `/hu/privacy.html`. GitHub Pages serves files only, so each language is a real page with its own `<html lang>`, a link to the other languages in the top bar and `<link rel="alternate" hreflang>` tags (with `x-default` on English). There is no script that swaps the text and no redirect from `navigator.language`: the language links are the navigation.

- A template uses `{{t:some.key}}` for text (HTML is allowed in a string, with single quoted attributes), `{{base}}` before an asset (empty at the root, `../` in a language folder) and `{{lang}}`, `{{url}}`, `{{alternates}}` and `{{switcher}}`. The words of the two scripts (`theme.js`, `download.js`) are `data-` attributes of their script tags, written from the strings too.
- **A new language** is `site/strings/<tag>.json` with every key of `en.json` and nothing else; the build, the switcher and the `hreflang` tags pick it up. `scripts/tooling/site-pages.test.ts` fails on a missing or extra key, a lost `{{version}}` or `{system}`, an empty text, a key no template uses, an `hreflang` that points at a page that does not exist and an asset that is not in `site/`.
- The English text is the authoritative one: the privacy page of another language says so and links the English page. The screenshots are English for every language (the Hungarian page says so under them); a set per language would be taken with the `screenshots` project, see [screenshots.md](screenshots.md).
- A change to the English text of a template changes the strings of every language: keep the same key, and update the other `strings/*.json` in the same pull request.

`scripts/tooling/build-site.js` writes the latest release into the pages while they are deployed (`{{version}}`, `{{notes}}` and `{{asset:<system>-<arch>}}`), so the download links follow the release without an edit.

To look at it, run `npm run site` and open <http://localhost:4173/> (`node scripts/tooling/serve-site.js <port>` for another port): it serves `site/` with the pages rendered and the latest release written in, and reads the files on every request, so an edit shows after a reload (<http://localhost:4173/hu/> is the Hungarian page).

The install steps are written in [install.md](../install.md) and on the page (in every language), so change them all. Under Settings, Pages, the source has to be **GitHub Actions**.

A change that adds, removes or visibly changes a feature (a page, the player bar, radio, platform support, install steps) updates the matching section of `site/templates/index.html` and the strings of every language in the same pull request, and the screenshots when what they show changed, see [screenshots.md](screenshots.md).

The documentation in this folder is read on GitHub and in the editor; it is not published on the website and not translated.
