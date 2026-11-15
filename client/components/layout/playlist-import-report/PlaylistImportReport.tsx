import type { PlaylistImportReport as Report } from '@shared/types/playlists';
import Confirm from '../../ui/confirm';
import { describePlaylistImport } from '../../../domain/playlist-import';
import { useTranslation } from '../../../i18n';

interface PlaylistImportReportProps {
  reports?: Report[];
  close?: () => void;
}

/** Tells what the import of playlist files did, until it is closed */
const PlaylistImportReport = ({ reports, close = () => {} }: PlaylistImportReportProps) => {
  const { t } = useTranslation();

  return <Confirm message={reports ? describePlaylistImport(t, reports) : null} hideConfirm cancelLabel={t('playlists.importClose')} cancel={close} />;
};

export default PlaylistImportReport;
