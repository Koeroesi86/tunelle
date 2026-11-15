import type { PlaylistImportReport } from '@shared/types/playlists';
import type { Translate } from '@shared/locales/translate';

/** How many of the entries that are not in the library the message names */
const namedUnmatched = 5;

const describeReport = (t: Translate, { name, status, imported, unmatched, streams }: PlaylistImportReport) => {
  if (status === 'unchanged') return t('playlists.importUnchanged', { name });

  const details = [
    t(status === 'created' ? 'playlists.importCreated' : 'playlists.importUpdated', { name, tracks: t('playlists.trackCount', { count: imported }) }),
    unmatched.length > 0 ? t('playlists.importMissing', { count: unmatched.length }) : undefined,
    streams > 0 ? t('playlists.importStreams', { count: streams }) : undefined,
  ];
  const listed = unmatched.slice(0, namedUnmatched).map(({ location, title }) => `  ${title ?? location}`);
  const more = unmatched.length > namedUnmatched ? [`  ${t('playlists.importMore', { count: unmatched.length - namedUnmatched })}`] : [];

  return [details.filter((detail) => detail !== undefined).join(', '), ...listed, ...more].join('\n');
};

/** The text that tells what an import of playlist files did: a line for each playlist, and under it the entries the library does not have */
export const describePlaylistImport = (t: Translate, reports: PlaylistImportReport[]) => reports.map((report) => describeReport(t, report)).join('\n\n');
