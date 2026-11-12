# Release notes

Every release has one short summary sentence in English and Hungarian, made from the commit subjects since the latest release, besides the list of changes that GitHub generates.

## Where it goes

- The body of the GitHub release: the English sentence, then the `.appx` remark, then the generated list (`generate_release_notes`). The website lists the bullets of the body only, so the sentence is never a bullet.
- The `<release>` entry of the Flatpak metainfo (`packaging/flatpak/*.metainfo.xml`), in both languages, stamped by `scripts/release/version.js` in `dist.yml` and escaped for XML.
- The "What's new" text of the Microsoft Store listing, in both languages, followed by the link to the releases (`store.yml`).

## How it is made

`scripts/release/release-summary.js summarize <latest tag>` runs in the `plan` job of `release.yml`, after the version is planned. It sends the subjects of `git log <latest tag>..HEAD` (at most 100, no merge commits) to the Gemini API (`gemini-flash-latest`, the free tier, with a rate limit far above two releases a week) with the key in the repository secret `GEMINI_API_KEY`, which only that step sees. The answer is JSON, `{"en": ..., "hu": ...}`; the job output `summary` carries it to `dist.yml` and `store.yml` (input `notes`, environment `RELEASE_SUMMARY`) and to the release body. GitHub Models, which this used first, was retired on 30 July 2026.

A request times out after 30 seconds. When the API is busy (429 or 5xx) or a request timed out, the script waits 5 seconds and tries again, twice at most, the second time with `gemini-flash-lite-latest`; a refused key or an answer that does not fit is not tried again. A release never waits for the summary. Without commits, a token or a usable answer (a missing key, an error status, no JSON, a language missing, over 400 characters), the script prints a warning and the generic text, `Bug fixes and improvements.` and `Hibajavítások és fejlesztések.`. `store.yml` run by hand or on Wednesday has no summary and uses the generic text as before. The script does not use Zod, as the `plan` job and `store.yml` run it without `npm ci`.

The commit subjects are sent to the Gemini API, so they must not hold anything that is not meant to be public (Google may use the prompts of the free tier to improve its products). The answer is a line of plain text, cleaned of line breaks and a leading bullet, and escaped where it is put into XML.

## Changing it

The prompt and the model are the top of the script. A language added to the Store listing needs its text in `release-summary.js` and `store.yml` (`RELEASE_LINK_HU` is the one for Hungarian).
