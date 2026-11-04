import { installerAppId } from './appUserModelId';

/** Chromium reports the desktop entry of the app on MPRIS, `tunelle.desktop` by default, and GNOME takes the icon of its media notification from it; a Flatpak installs the entry under its app ID, so it has to be named */
export const getFlatpakDesktopName = (flatpakId: string | undefined) => (flatpakId === installerAppId ? `${installerAppId}.desktop` : undefined);
