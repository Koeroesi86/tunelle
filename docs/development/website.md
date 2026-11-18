# Website

The website is the static pages in `site/` (plain HTML, CSS and three small scripts), published on GitHub Pages by `.github/workflows/pages.yml` when `site/` changes on `master` and after every release.

## Languages

The pages are templates, `site/templates/index.html` and `privacy.html`, filled at build time with the strings of each language in `site/strings/<tag>.json` (`scripts/tooling/site-pages.js`; the templates and the strings are not published). English is at the root, so its addresses (`/`, `/privacy.html`) never changed, and every other language is a folder: `/hu/`, `/hu/privacy.html`. GitHub Pages serves files only, so each language is a real page with its own `<html lang>`, a link to the other languages in the top bar and `<link rel="alternate" hreflang>` tags (with `x-default` on English). There is no script that swaps the text and no redirect from `navigator.language`: the language links are the navigation.

- A template uses `{{t:some.key}}` for text (HTML is allowed in a string, with single quoted attributes), `{{base}}` before an asset (empty at the root, `../` in a language folder) and `{{lang}}`, `{{url}}`, `{{alternates}}` and `{{switcher}}`. The words of the scripts (`theme.js`, `download.js`, and the label of the menu button) are `data-` attributes of their script tags, written from the strings too.
- **A new language** is `site/strings/<tag>.json` with every key of `en.json` and nothing else; the build, the switcher and the `hreflang` tags pick it up. `scripts/tooling/site-pages.test.ts` fails on a missing or extra key, a lost `{{version}}` or `{system}`, an empty text, a key no template uses, an `hreflang` that points at a page that does not exist and an asset that is not in `site/`.
- The English text is the authoritative one: the privacy page of another language says so and links the English page. The screenshots are English for every language (the Hungarian page says so under them); a set per language would be taken with the `screenshots` project, see [screenshots.md](screenshots.md).
- A change to the English text of a template changes the strings of every language: keep the same key, and update the other `strings/*.json` in the same pull request.

`scripts/tooling/build-site.js` writes the latest release into the pages while they are deployed (`{{version}}`, `{{notes}}` and `{{asset:<system>-<arch>}}`), so the download links follow the release without an edit.

To look at it, run `npm run site` and open <http://localhost:4173/> (`node scripts/tooling/serve-site.js <port>` for another port): it serves `site/` with the pages rendered and the latest release written in, and reads the files on every request, so an edit shows after a reload (<http://localhost:4173/hu/> is the Hungarian page).

Below 600 px the links of the top bar sit behind a menu button (`menu.js` sets `data-menu` on the bar, which the CSS reads). Without the script there is no button and the links stay in a second row.

The install help under the download cards (macOS, Flatpak, AppImage) is a `<details>`; `download.js` opens the one marked `data-for` the visitor's system, closes the other ones and marks it (`.detected`), and a link to a closed one opens it. Without the script they are all open (the AppImage one stays closed).

The install steps are written in [install.md](../install.md) and on the page (in every language), so change them all. Under Settings, Pages, the source has to be **GitHub Actions**.

A change that adds, removes or visibly changes a feature (a page, the player bar, radio, platform support, install steps) updates the matching section of `site/templates/index.html` and the strings of every language in the same pull request, and the screenshots when what they show changed, see [screenshots.md](screenshots.md).

## Search and link previews

- `sitemap.xml` (every page of every language with its `xhtml:link` alternates) and `robots.txt` (points at the sitemap) are written by `build-site.js` and served by `npm run site` (`renderFiles` in `site-pages.js`), so a new language or page is in them without an edit. `site-pages.test.ts` checks that each URL of the sitemap is a built page.
- The home page has `og:` and `twitter:` tags with `site/social-preview.png` (1280×640, with `og:image:alt`, whose text is `meta.imageAlt`) and `SoftwareApplication` JSON-LD (`renderStructuredData`: free, MIT, the latest release as download). To check them, open the built page in the [Rich Results Test](https://search.google.com/test/rich-results) and share the address in a chat.
- `site/social-preview.png` is the icon and the home screenshot: retake the screenshots, then `npm run social-preview`. The same file is the social preview of the repository (Settings, General, Social preview; GitHub has no API for it, so upload it by hand when it changed).
- The repository topics are set with `gh repo edit --add-topic <topic>` (`gh repo view --json repositoryTopics` lists them).
- Search Console and Bing Webmaster Tools are registered by hand by the owner: add the site as a URL prefix property and verify it with the HTML tag method or a DNS record, then submit `sitemap.xml`. Note the method used here once it is done.

## Visit statistics

Visits are counted with Cloudflare Web Analytics (free, no cookie, nothing stored in the browser, so no consent banner). The beacon is written into every page by `renderAnalytics` in `site-pages.js` (`<script type="module">`, as Cloudflare gives it) from `analyticsToken`; with an empty token nothing is written. The token is public. The statistics are in the Cloudflare dashboard, Analytics & Logs, Web Analytics, for the host `koeroesi86.github.io`. The privacy page (`privacy.website.*`, every language) names the service and what it counts: change it together with the beacon. To check it, open a built page, look for `beacon.min.js` in the network tab and for no cookie under Application.

The documentation in this folder is read on GitHub and in the editor; it is not published on the website and not translated.
