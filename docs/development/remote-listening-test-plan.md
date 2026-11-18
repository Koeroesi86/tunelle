# Test plan: remote listening

What checks #360 (a Tunelle listens to another one), and where. The design is in [remote-access-discovery.md](../app/remote-access-discovery.md).

| Part | Check | Where |
| --- | --- | --- |
| Host server, approval, devices, controls | Unit tests against mocks | `electron/remote/*.test.ts` |
| Listener pairing, follow, relay | Unit tests against mocks | `electron/remote/*.test.ts`, `client/` |
| mDNS packets | Unit tests; one real socket on one machine | `*.integration.test.ts` |
| Whole flow with two apps | `e2e/functional/remote.spec.ts` | `npx playwright test e2e/functional/remote.spec.ts --project=e2e` (`npm run test:e2e -- remote` is read as a project name) |

## The end to end test

Two apps on one machine, each with its own profile: `session` is the host (with the library) and the `second` fixture of `e2e/support/app.ts` is the listener. The address is typed (127.0.0.1 and the port the host shows), as mDNS between two apps on one machine says nothing about a network.

1. Host: Settings, switch "Remote listening" on; read the port from the text next to it.
2. Listener: Nearby Tunelles in the sidebar, Address and Port, Connect, "The codes match, ask to listen".
3. Host: Approve in the dialog that asks on whatever page is open. Listener: "Listening to 127.0.0.1:<port>".
4. Host plays Pitch Perfect (440 Hz). Listener: "Listen along", and the audio it sends out is 440 Hz (`expectTone`).

The same helper pairs the two apps for the other tests of the file, each asserted on the audio or the playback position: pause and play (silence, then 440 Hz again), the next track (880 Hz on both), a seek (the two positions are less than 1.5 s apart), a revoke (silence on the listener, "The host does not know this device any more"), and a skip that the listener sends after the host granted Skip (880 Hz on both).

Not covered here: the codes are not compared (the test cannot see two screens as a person does), mDNS discovery, a clock offset between two computers, a denied or blocked device, the volume and the queue.

## By hand

The steps that need a person, a shell or a second computer. Each says what runs it when it also has a test; a step that is only by hand has an empty "Test" cell. A run is recorded in the pull request that makes the change, with the system and what was seen.

| # | Step | What to see | Test |
| --- | --- | --- | --- |
| 1 | Start two apps with their own profiles (`TUNELLE_APP_DATA`, `HOME` and `XDG_CONFIG_HOME` for each, see [building.md](building.md)) | Separate settings, paired devices and library | `e2e/support/app.ts` (`second`) |
| 2 | Host mode off: `ss -ltnp` and `avahi-browse -art _tunelle._tcp` (`dns-sd -B _tunelle._tcp` on macOS and Windows) | Nothing listens on a port of the app and nothing is advertised | `host-controller.integration.test.ts` |
| 3 | Switch it on | The host is in the listener's nearby list and in `avahi-browse`; the TXT holds name, version, protocol and port, no path or track; the address typed by hand works with multicast blocked | `mdns.test.ts` |
| 4 | Ask from the listener with a note | The host shows the note as text; `curl -k https://127.0.0.1:<port>/remote/now-playing` and `/remote/audio` with no credential and with the pending id answer 401; Deny keeps them at 401; Approve shows the same code on both screens and the listener hears the track | `host-server.integration.test.ts`, `remote.spec.ts` |
| 5 | Seek, pause, skip and change the queue on the host; stop the listener's network for a while and bring it back; play a track of the listener's own | The listener follows each; it joins again without a prompt; an own track leaves the session; a stopped host shows as nothing playing | `remote.spec.ts`, `use-remote-follow.test.tsx` |
| 6 | Revoke, then block | The stream and the audio end at once; a new request needs a new approval; a blocked device shows no prompt | `host-server.integration.test.ts`, `remote.spec.ts` |
| 7 | Delete the host's certificate so it makes a new one | The approved listener refuses the connection and asks again | `listener-client.integration.test.ts` |
| 8 | 100 requests in a loop with `curl -k`, a 1 MB note and a note with `<img src=x onerror=alert(1)>` | The limits hold, no flood of prompts, the note is text | `access.test.ts`, `host-server.integration.test.ts` |
| 9 | Every control off, then one on, with `curl -k -X POST /remote/control` | Refused for all, then only that one works | `host-routes.test.ts`, `listener-client.integration.test.ts` |
| 10 | Request `/library/...`, `/../`, other routes | Nothing but the playing track and its cover is served, no error dialog in the host | `host-routes.test.ts` |
| 11 | A second computer on the same Wi-Fi, with the firewall on | The prompt of the system (Windows firewall, macOS local network, avahi next to our responder) and steps 3 to 5 work | |
