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
2. Listener: Settings, Address and Port, Connect, "The codes match, ask to listen".
3. Host: Approve in the dialog that asks on whatever page is open. Listener: "Listening to 127.0.0.1:<port>".
4. Host plays Pitch Perfect (440 Hz). Listener: "Listen along", and the audio it sends out is 440 Hz (`expectTone`).

Not covered here: the codes are not compared (the test cannot see two screens as a person does), mDNS discovery, a clock offset between two computers, a denied or blocked device, remote controls.
