/** What the page asks of whatever runs the library, the player data and the platform: the Electron main process, or another host. See docs/app/client-backend.md */
export interface Backend {
  send: (channel: string, payload?: unknown) => void;
  on: <T = unknown>(channel: string, listener: (payload: T) => void) => void;
  /** The address of the page and of everything the host serves: the library, the covers and the audio */
  resolveUrl: (route: string) => string;
  /** The path of a dropped or picked file on the disk of the host */
  pathForFile: (file: File) => string;
  capabilities: {
    /** Something blurs behind the translucent parts of the window */
    blur: boolean;
    /** The host shows the player in the media controls of the desktop, so the page does not use navigator.mediaSession */
    mpris: boolean;
  };
}

/** Where the page runs without a host (a unit test, a plain browser): nothing is sent, nothing is heard and no platform feature is there */
const detachedBackend: Backend = {
  send: () => undefined,
  on: () => undefined,
  resolveUrl: (route) => `tunelle://app${route}`,
  pathForFile: () => '',
  capabilities: { blur: false, mpris: false },
};

let current: Backend = detachedBackend;

export const setBackend = (backend: Backend) => {
  current = backend;
};

export const getBackend = () => current;
