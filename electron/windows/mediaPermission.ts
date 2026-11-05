import { session } from 'electron';
import type { ListenerContext } from '../listeners/listenerContext';

const originOf = (url: string) => (URL.canParse(url) ? new URL(url).origin : undefined);

/**
 * Without the permission for media, Chromium gives the output devices no names (it hides them as a fingerprint), and the settings could not tell a DAC from the speakers.
 * Only the check says yes, and only for the page of the app (the protocol of a build, the dev server of a development run); nothing is recorded.
 */
export const watchMediaCheck = (getPageUrl: () => string | undefined) =>
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => {
    const pageUrl = getPageUrl();
    return permission === 'media' && pageUrl !== undefined && originOf(origin) !== undefined && originOf(origin) === originOf(pageUrl);
  });

const registerMediaPermission = ({ windows }: ListenerContext) => watchMediaCheck(() => windows.main?.webContents.getURL());

export default registerMediaPermission;
