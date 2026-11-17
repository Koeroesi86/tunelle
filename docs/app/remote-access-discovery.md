# Remote access: discovery, certificate and now-playing route

First pull request of [#360](https://github.com/Koeroesi86/tunelle/issues/360) (listen along to the host's now playing): a doc and a proof, merged before the feature. The proof was a throwaway script (mDNS on `dgram` and a certificate with pinning, run on Fedora and by hand a second time with the same result); it is not kept, as the next pull requests write the same code in `electron/` with tests. What a system could not be tried on is marked **unverified**.

## Decisions

| Question | Decision |
| --- | --- |
| Discovery | mDNS / DNS-SD with native `dgram`, service `_tunelle._tcp`. No `multicast-dns`. SSDP / UPnP is not needed. |
| Certificate | Made with `node:crypto` alone (no `selfsigned`, `node-forge` or `openssl` binary). |
| Pinning | The listener keeps the **certificate** of the host and passes it as `ca`; it does not rely on `checkServerIdentity` alone (see below). |
| Now-playing state | Stays in the renderer; it pushes snapshots to the main process by IPC, as MPRIS does. |
| Two instances | Work side by side with `--user-data-dir` and `TUNELLE_APP_DATA`; no new variable is needed. |

## mDNS with `dgram`

The proof opened two UDP sockets on `224.0.0.251:5353` with `reuseAddr`, joined the group, kept multicast loopback on, and had a responder and a browser in one process:

- the browser sent a PTR question for `_tunelle._tcp.local`; the responder answered with PTR, SRV (port and host), TXT and A records in one packet, and the browser read all of them;
- the goodbye is the same records with a TTL of 0;
- names are written without compression and read with compression pointers (answers of avahi and Bonjour use them).

The whole encoder and decoder is about 80 lines, so the time box held and the library is not needed. What the advertisement carries: the TXT records `name`, `version`, `port` and `approval`, nothing of the library or of what plays. It runs only while host mode is on; the listener opens its socket only while the Nearby Tunelles list is open.

Left for the implementation, with a unit test on a fake socket each: an answer to questions that arrive later (every ~1 s at first, then backing off), refresh before the TTL ends, one socket per interface (VPN and docker interfaces send replies nobody can reach, so the A records list only the addresses of interfaces that are up and not loopback), AAAA, and ignoring our own packets.

Measured here (Fedora, Node 24, no avahi running): two sockets share port 5353 with `reuseAddr` and multicast loopback delivers the packet to both, so two processes on one machine find each other. **Unverified:** a run next to a running `avahi-daemon` (it also binds 5353 with `SO_REUSEADDR` and should share it, the same as Bonjour), and whether the CI runners deliver multicast loopback; the Linux integration test for discovery is added only if a CI run shows it does, and the end to end test uses the manual address.

### Platform behaviour

| System | What to expect | Status |
| --- | --- | --- |
| Linux | No prompt. `firewalld` can drop the inbound port silently (a Fedora default zone blocks unlisted ports), so the host screen help text names the firewall. Avahi next to our responder shares 5353. | The mDNS part tried on Fedora without avahi; the firewall and avahi **unverified** |
| macOS | From macOS 15 the first mDNS or LAN access asks for the Local Network permission; the application firewall asks when the host starts to listen. A denied permission fails without an error. | **Unverified** |
| Windows | The firewall asks when a process first listens: the host server, and possibly the mDNS socket. A denied prompt fails without an error. | **Unverified** |
| Loopback only | A host bound to loopback does not prompt on any system and is not advertised. | Expected, **unverified** |
| AppImage, Flatpak, Store (MSIX) | The Flatpak has `--share=network` (`package.json`), which covers both sides. An MSIX package probably needs the `privateNetworkClientServer` capability to listen and to receive multicast; electron-builder's default manifest was not checked. | **Unverified** |

The prompts appear at these moments: Windows when the host server first listens (and the mDNS socket when it advertises or first browses), macOS on the first mDNS or LAN access and when the host listens, Linux never. The setting shows a hint at the moment the user turns host mode on; a denied prompt cannot be detected, so the host screen keeps the help text.

## The certificate

`node:crypto` cannot make an X.509 certificate (`X509Certificate` only reads one), but it can make the key (`generateKeyPairSync('ec')`), export the public key as SPKI DER and sign. The certificate is a short DER structure, so the proof wrote it by hand (about 40 lines: version, serial, ECDSA-SHA256, the name as issuer and subject, validity, the SPKI) and signs it with `createSign('sha256')`. `X509Certificate`, `https.createServer` and a client all accept it. No dependency and no `openssl` binary (which Windows has not).

- **Key and lifetime.** ECDSA P-256, stored with the certificate in the app data folder (the key file with mode 0600). The certificate is valid for 10 years. Renewing is making a new one, which is also what deleting the file does: pinned listeners then **refuse** it and ask for a new approval. A host should not renew before it expires, so a renewal is a rare, visible event and the approval code shows the user that the device is the same.
- **The short code** of the approval is the first digits of the SHA-256 fingerprint of the certificate (`X509Certificate.fingerprint256`), shown on both screens in groups.

### Pinning needs `ca`

The issue proposed `rejectUnauthorized: false` with a `checkServerIdentity` that compares fingerprints. The proof showed that this does **not** pin: for a self-signed certificate the TLS layer already has a verify error, and Node calls `checkServerIdentity` only when there is none, so the function never ran and the connection was accepted. What works (all three cases were run):

| Client options | Result |
| --- | --- |
| `ca: [pinnedPem]`, `checkServerIdentity: () => undefined` | answered 200 |
| `ca: [pinnedPem]`, host presents another certificate | refused, `self-signed certificate` |
| `rejectUnauthorized: false`, `checkServerIdentity` that returns an error | answered 200: the check never ran |

So the listener stores the certificate of the host (PEM) when it is approved, passes it as the only `ca`, and `checkServerIdentity` returns `undefined` (the host is an IP address and has no name in the certificate). Before the approval, a client that has no pin connects with `rejectUnauthorized: false`, reads `getPeerCertificate()` and shows the code; it sends nothing but the request, which holds no secret. Always check `response.ok` and end the streams with `pipeline`.

## Where the now-playing state lives

The playlist and the queue (`nowPlaying`, `currentSong`, `isPlaying`, `upNext`, `playNext`) are in the Redux `uiState` of the renderer, and the position is in the audio element; the main process holds none of it. The same split is already used for the media controls: `client/hooks/use-mpris.ts` sends the track, whether it plays and the position through `electronAPI.send` and the main process serves it (see [mpris.md](mpris.md)).

The route for the host: a hook of the same kind sends a `REMOTE_STATE` snapshot (track, cover key, position at a time, playing, queue head) when the track, play state or queue head changes and on a seek, and the main process keeps the last one and pushes it to approved listeners over the one connection; a listener extrapolates the position from the time of the snapshot. The remote controls (a later pull request) go the other way: the main process sends the command to the renderer by IPC and the renderer does it as the user would. The file of the current track is served by the main process from the library path of that snapshot only.

For the listener, its main process receives the snapshots and the renderer's player gets a `tunelle://` URL that the main process relays from the host (see [tunelle-protocol.md](tunelle-protocol.md)); the player follows the snapshot through a mode of the `uiState` that leaves when the user starts a track.

## Two instances side by side

`holdSingleInstance` (`electron/windows/single-instance.ts`) takes the lock of the profile, and the lock follows the user data folder, so a start with its own `--user-data-dir` does not meet another one. The proof started the built app twice (headless, `--user-data-dir=<a|b>/user-data` and `TUNELLE_APP_DATA=<a|b>`, `ELECTRON_RUN_AS_NODE` unset): both stayed running with their own `tunelle/` library folder. The test plan and the end to end test use that; no new `TUNELLE_` variable is needed. Host port: each instance gets its own random free port, so they do not clash.

## The code so far

`electron/remote/` holds the pieces the proof settled, with tests (second and third to fifth pull request of #360, nothing calls them yet):

- `dns-packet.ts`: the mDNS wire format. `decodeMessage` returns `undefined` for a cut or made up packet (bounds, a limit on name pointers) instead of throwing, as the socket handler must not throw into the main process.
- `certificate.ts`: `createHostIdentity`, `approvalCode` and the pinning options. `certificate.integration.test.ts` runs them against a real TLS server: the pinned certificate is answered, another one is refused, and the first contact reads the same code as the host shows.
- `access.ts`: who may listen. `AccessControl` keeps the waiting requests, the approved devices and the blocked ones in memory, and `snapshot()` is what the host writes to disk (the hash of the secret, never the secret; `host-store.ts` writes it). A request is checked in this order: rate limit per address (5 a minute, counted before the body is read, so garbage counts too), the schema (device id, name up to 60 and note up to 200 characters, control characters turned into spaces), blocked, already approved, the pending limit (5, a device that already waits does not need a new place) and only then a prompt. Waiting requests expire after ten minutes. The note is kept as it was sent, apart from the control characters: showing it as text is the job of the screen. A device id is made by the listener, so a blocked device that picks a new id is a new device; blocking by address is not done, as addresses on a LAN change and are shared behind one router.
- `host-routes.ts` (the two routes and the now playing, unit tested without a socket), `now-playing.ts` (its schema) and `host-server.ts`: the HTTPS server of the host (`startHostServer`), built on the certificate and `AccessControl`. Four routes exist and every other path and method is a 404: `POST /remote/request` (the listener's request; 202 waits, 200 approved, 400 invalid, 403 blocked, 429 rate limited, 503 full) and `GET /remote/now-playing` (the device id in `x-tunelle-device` and the secret as `Authorization: Bearer`, else 401, or 429 for an address with too many wrong secrets) and `GET /remote/events` (the same credentials; a server sent events stream that sends the now playing at once and again at each change, with a `: ping` every 25 s). A stream is checked against the access control at each event and ping, so a device that was revoked or blocked is cut off at the next one; at most 20 streams are open (503 after that). The polling route stays for a listener that cannot keep a stream. `POST /remote/control` takes one command (`control-command.ts`: `playPause` with `play`, `pause` or `toggle`, `skip` with `next` or `previous`, `seek` with a position in seconds, `volume` with a level from 0 to 1) with the same credentials: 401 for a device that is not approved, 400 for a command that is not valid, 403 when the host did not allow that control for that device (the approval alone gives none), else 200 and the command goes to the page as `REMOTE_CONTROL`. `queue` is a control that the host can grant, but no command exists for it yet: a listener cannot reach the library of the host, so what it would add is still open. The page that acts on `REMOTE_CONTROL` comes with the renderer part. A body is read up to 4 KB. A handler that fails answers 500, and a socket or TLS error ends that socket, so nothing reaches the main process as an unhandled error. `loopbackOnly` binds `127.0.0.1`.
- The secret reaches the listener on its next request after the approval: the approved answer carries `secret` once, and later answers do not. The listener polls its request until then. Whoever knows the (random, 128 bit) device id could pick the secret up first, and only the host and the listener know it; a revoke or block before the pickup drops it. Wrong secrets are limited per address: `authorize(address, deviceId, secret)` counts the wrong ones (10 a minute), and past the limit even the right secret gets 429 until the minute is over, so a guess is not free (the secret is 256 bits, so guessing was no route anyway, but the limit stops a flood of hashing). The right secrets of a listener that asks every second are not counted.
- `host-server.integration.test.ts` runs the flow against the real server with a pinned client: waiting, denied, unknown, approved, revoked and blocked devices, a hostile and an oversized note, a flood (rate and pending limits), library paths and `../`, and a closed server that refuses the connection.
- `listener-client.ts`: the other end, in the main process of the listener. `contact` is the first contact (a request without credentials over an unpinned connection, which gives the certificate and the code for both screens), `requestToListen` and `fetchNowPlaying` run pinned (a changed certificate fails with `self-signed certificate`), and `fetchNowPlaying` returns `undefined` for a 401, which is what a revoked, blocked or not yet approved device sees. Answers are cut at 64 KB, a call times out after 5 s, and the answer is read through Zod. `expectedPosition` runs a playing snapshot on from its time (never backwards), and `driftCorrection` gives a position to seek to only when the listener is more than 0.5 s away, so the audio clock does the small steps. `listener-client.integration.test.ts` runs it against the real host server.

- `host-store.ts`, `host-controller.ts` and `host-requests.ts` (part 6): what the host keeps and how the app drives it. Files sit in `<app data>/remote/`: `host.json` (settings: `enabled` off by default, `name`, `loopbackOnly`, and the `port` of the last start), `devices.json` (the `snapshot()` of `AccessControl`, so the hash of the secret and never the secret), `host-certificate.pem` and `host-key.pem` (mode 0600; made on the first start, and deleting them makes a new certificate that listeners refuse until approved again). A stored file that is cut or has a wrong part falls back to the default of that part. `createHostController` starts and stops the server by the settings (nothing listens while `enabled` is false), reuses the saved port and takes a free one when it is taken, writes the devices after every approval, revoke, block or change of controls, and reports a `HostState` (settings, whether it runs, the code, the waiting requests without their address, the devices and the error of a failed start) through a callback. A request that starts to wait reaches the callback at once (`ObservedAccess`).
- `register-remote-listeners.ts`: the channels between the page and the host. The page sends `GET_REMOTE_HOST`, `SET_REMOTE_HOST` (parts of the settings), `DECIDE_REMOTE_DEVICE` (`approve`, `deny`, `revoke`, `block` for a device id), `SET_REMOTE_DEVICE_CONTROLS` and `REMOTE_STATE` (the now playing); the main process answers with `REMOTE_HOST_STATE`. A message of the wrong shape is dropped. Nothing in the page sends these yet: the settings screen and the hook that sends `REMOTE_STATE` come with the interface.

## Checks for the next pull requests

- Electronegativity baseline and the CSP: the listener only talks from the main process, so the renderer's CSP stays as is; re-run `npm run security:electron` with the server in.
- Integration tests with a real TLS server use this certificate code on every system; discovery over multicast loopback only if it works on CI.
