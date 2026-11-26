# Remote access: discovery, certificate and now-playing route

First pull request of [#360](https://github.com/Koeroesi86/tunelle/issues/360) (listen along to the host's now playing): a doc and a proof, merged before the feature. The proof was a throwaway script (mDNS on `dgram` and a certificate with pinning, run on Fedora and by hand a second time with the same result); it is not kept, as the next pull requests write the same code in `electron/` with tests. What a system could not be tried on is marked **unverified**.

More: [remote access: the code of the host](remote-access-host.md), [remote access: the code of the listener](remote-access-listener.md), [remote access: following the host](remote-access-follow.md).

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

The whole encoder and decoder is about 80 lines, so the time box held and the library is not needed. What the advertisement carries: the TXT records `name`, `version`, `port`, `approval` and `protocol` (the version of what host and listener say to each other, `REMOTE_PROTOCOL` in `shared/constants/remote-protocol.ts`), nothing of the library or of what plays. It runs only while host mode is on; the listener opens its socket only while the Nearby Tunelles list is open.

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

The playlist and the queue (`nowPlaying`, `currentSong`, `isPlaying`, `upNext`, `playNext`) are in the Redux `uiState` of the renderer, and the position is in the audio element; the main process holds none of it. The same split is already used for the media controls: `client/hooks/use-mpris.ts` sends the track, whether it plays and the position through the backend (`send`, see [client-backend.md](client-backend.md)) and the main process serves it (see [mpris.md](mpris.md)).

The route for the host: a hook of the same kind sends a `REMOTE_STATE` snapshot (track, cover key, position at a time, playing, queue head) when the track, play state or queue head changes and on a seek, and the main process keeps the last one and pushes it to approved listeners over the one connection; a listener extrapolates the position from the time of the snapshot. The remote controls (a later pull request) go the other way: the main process sends the command to the renderer by IPC and the renderer does it as the user would. The file of the current track is served by the main process from the library path of that snapshot only.

For the listener, its main process receives the snapshots and the renderer's player gets a `tunelle://` URL that the main process relays from the host (see [tunelle-protocol.md](tunelle-protocol.md)); the player follows the snapshot through a mode of the `uiState` that leaves when the user starts a track.

## Two instances side by side

`holdSingleInstance` (`electron/windows/single-instance.ts`) takes the lock of the profile, and the lock follows the user data folder, so a start with its own `--user-data-dir` does not meet another one. The proof started the built app twice (headless, `--user-data-dir=<a|b>/user-data` and `TUNELLE_APP_DATA=<a|b>`, `ELECTRON_RUN_AS_NODE` unset): both stayed running with their own `tunelle/` library folder. The test plan and the end to end test use that; no new `TUNELLE_` variable is needed. Host port: each instance gets its own random free port, so they do not clash.

## The name of the device

The listener asks with its host name (`os.hostname()`), and the host answers `invalid` to a name that is empty or over 60 characters, so the listener showed "Could not reach the host: The host answered invalid" and no request reached the host. Symptom: the end to end test timed out on macOS only, where the host name of the runner is long. `deviceNameOf` (`electron/remote/device-name.ts`) cuts the name to the limit and falls back to `Tunelle`. To check: the failed run shows the listener's error text in `error-context.md` of the Playwright report.
