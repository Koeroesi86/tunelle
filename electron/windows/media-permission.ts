import { session } from 'electron';
import type { ListenerContext } from '../listeners/listener-context';

const originOf = (url: string) => (URL.canParse(url) ? new URL(url).origin : undefined);

/**
 * Without the permission for media, Chromium gives the output devices no names (it hides them as a fingerprint), and the settings could not tell a DAC from the speakers.
 * Only the check says yes, and only for the page of the app (the protocol of a build, the dev server of a development run); nothing is recorded.
 */
const isAppMedia = (getPageUrl: () => string | undefined, permission: string, origin: string) => {
  const pageUrl = getPageUrl();
  return permission === 'media' && pageUrl !== undefined && originOf(origin) !== undefined && originOf(origin) === originOf(pageUrl);
};

export const watchMediaCheck = (getPageUrl: () => string | undefined) => {
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => isAppMedia(getPageUrl, permission, origin));
  // a request is answered like the check: the page of the app may ask for media, nothing else may ask for anything
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) =>
    callback(isAppMedia(getPageUrl, permission, details.requestingUrl))
  );
};

const registerMediaPermission = ({ windows }: ListenerContext) => watchMediaCheck(() => windows.main?.webContents.getURL());

export default registerMediaPermission;
