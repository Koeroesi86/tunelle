import { session } from 'electron';

/**
 * Without the permission for media, Chromium gives the output devices no names (it hides them as a fingerprint), and the settings could not tell a DAC from the speakers.
 * Only the check says yes, and only for the page of the app; nothing is recorded.
 */
const allowsMediaCheck = (permission: string, origin: string) => permission === 'media' && origin.startsWith('tunelle://');

const registerMediaPermission = () => {
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => allowsMediaCheck(permission, origin));
};

export default registerMediaPermission;
