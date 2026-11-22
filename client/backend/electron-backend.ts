import type { ElectronApi } from '@shared/types/global';
import type { Backend } from './backend';

/** The main process of Electron, reached through the preload (electron/preload.ts) and the `tunelle://app` protocol */
export const createElectronBackend = (api: ElectronApi): Backend => ({
  send: api.send,
  on: api.on,
  resolveUrl: (route) => `tunelle://app${route}`,
  pathForFile: api.getPathForFile,
  capabilities: { blur: api.blurred, opaque: api.opaque, mpris: api.mpris },
});
