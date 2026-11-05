# The Microsoft Store

A release goes to the Microsoft Store through `store.yml` (the workflow `Store submission`). The Store brings the update to the installed apps after its certification.

## When it runs

`release.yml` calls it after every release it publishes, it runs weekly (Wednesday) for the latest release, in case a release was skipped because a submission was still in certification, and by hand it takes the tag of a release (`workflow_dispatch`).

- An automatic run commits. It skips quietly when there is nothing to do yet (a submission in certification, or a release that is not greater than the version in the Store), and fails when somebody has to look (a draft, or a failed submission that is still there). This is `decide` of `scripts/release/store-submission.js`.
- By hand it stops on everything it cannot submit, and without `commit` it only makes the draft.

## The draft

A draft is left to be looked at in Partner Center, not changed there: a submission made through the API is changed only through the API (a change in Partner Center ends its use by the API, and may leave it in an error state). So the draft is deleted in Partner Center, before the run with `commit`.

## The package

Both packages of the release (x64 and arm64) are put in one bundle, as the Store developer CLI (`msstore`) takes `.msix`, `.msixbundle` and `.msixupload` and not the `.appx` of the release. The Store signs the package itself, so the bundle needs no signature. The release notes of the draft are a generic text (`RELEASE_NOTES` of the workflow, and one for each other language of the listing, `RELEASE_NOTES_HU`), and with `commit` it is then submitted.

## Secrets

The secrets of the Microsoft Entra application (Manager role in Partner Center) are in the environment `microsoft-store`, limited to `master`, with no reviewer: an automatic run starts by itself. The Store product ID is its variable `MS_STORE_PRODUCT_ID`. Certification then runs on the side of Microsoft.

## `scripts/release/store-submission.js`

- `notes <file> <result> <notes> [<language>=<notes>]...` writes the submission in `<file>` to `<result>` with the release notes of its listings set to `<notes>` and the packages of the earlier submission marked for deletion (all but the one pending upload), or to the notes of the language of the listing (`hu` for `hu-hu`), for `msstore submission updateMetadata`.
- `decide <status file> <submission file> <tag> <automatic>` says whether the release is submitted now (`submit=true` or `false` and the reason, also to `$GITHUB_OUTPUT`).
- `status <file>` fails unless the last submission in the output of `msstore submission status` is published.
- `check <tag> <file> <package version>...` fails when the release cannot go to the Store, with the output of `msstore submission get` in `<file>`.

`store.yml` runs both `status` and `check` before it submits a release. The Store takes a version only when it is greater than the one of the last submission and its fourth part is 0 (the Store keeps that part for itself, electron-builder adds the 0). A submission that is not published (in certification, or failed and still there) blocks the next one: the Store keeps one per app, and nothing here deletes or cancels it.

## The certification kit (`wack.yml`)

The Windows App Certification Kit (the tests that Partner Center runs on a package) runs on the x64 package, so a problem shows before the submission, and a run of the installed package shows that it does not look for updates on GitHub. The second is also done for the arm64 package on an arm64 runner (`windows-11-arm`), where the kit is not installed (its image has the SDK without it, and nothing says it runs on arm64), so the Store package of that processor is installed and started at least.

`dist.yml` calls it with the package it built, so it runs for every pull request and before a release is published; by hand it checks the package of a published release (the latest, or the tag it is given). The package is unsigned, so a copy of it is signed with a certificate made for the run, which the kit needs to install it; the package that is uploaded to the Store is the one of the release.
