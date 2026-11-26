# Servers of the user: load and rate limits

What the app asks of a server, and how often. Part of [Servers of the user (Subsonic and Jellyfin)](sources.md).

## Load and rate limits

A window of tiles asks for dozens of pages and covers at once, which a server answers late or refuses. `openSource` asks a GET again when the server says 429 or 503 (at most twice, after the `Retry-After` it names, capped at 5 s, else 0.5 s and 1 s). The pages of a list are asked a few at a time per server (`createGate`, 4), the same request that is on its way is not asked again (`register-source-listeners.ts`), and the covers go through a gate of 6 per server. A cover is kept by the page for a day (`Cache-Control: private, max-age=86400`) and an answer that is an error is not (`no-store`). The tiles show a cover as a background image, which has no way to ask again after a failure: a cover that failed after its retries stays blank until the page is shown again. Plex asks for its music sections once per client. Connections are not pooled (`agent: false`), so every request pays its handshake.

The views of a server fetch two pages ahead of the window (`pagesAhead` of `usePageLoader`, set by the `source-*` containers; the local library has none), up to the end of the list, so a scroll finds the next pages there. They go through the same gate, so they share the queue with the pages the window needs (in order, so after a jump the window waits for the prefetch that is already queued).

A scroll that jumps leaves pages queued that nobody wants. The views tell the main process which pages the window wants (`keepPages`, `SOURCE_BROWSE_KEEP`), and the pages of that list that still wait for their turn are dropped (`createGate().drop`); a page that already runs is left to finish, and one that was dropped is asked again if it is wanted later.

The covers are dropped the same way, by the abort of their request: a tile that scrolls away aborts its cover, and one that still waits for its turn in the gate of the covers is not fetched. Whether the page aborts a background image that is no longer needed was not measured here: if it does not, the queue of the covers still drains as the others are answered.
