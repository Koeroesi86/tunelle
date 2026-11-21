import { useTranslation } from '../../../i18n';
import type { LibraryKind, SourceKind } from '@shared/schemas/sources';
import type { OnlineView } from '../../../redux/types';
import RadioStations from '../../../containers/pages/radio-stations';
import SourceLibrary from '../../../containers/pages/source-library';
import SourceServers from '../../../containers/pages/source-servers';
import RemoteListener from '../../../containers/pages/remote-listener';
import ViewSwitcher from '../../ui/view-switcher/ViewSwitcher';
import type { ViewItem } from '../../ui/view-switcher/ViewSwitcher';

interface OnlineSourcesProps {
  view: OnlineView;
  setView: (view: OnlineView) => void;
}

const sourceKinds: SourceKind[] = ['subsonic', 'jellyfin', 'plex'];
const sections: LibraryKind[] = ['albums', 'artists', 'tracks'];

const OnlineSources = ({ view, setView }: OnlineSourcesProps) => {
  const { t } = useTranslation();
  const views: ViewItem<OnlineView>[] = [
    { view: 'radio', label: t('online.radio'), panel: <RadioStations /> },
    { view: 'servers', label: t('online.servers'), panel: <SourceServers kind="subsonic" openSection={(section) => setView(`subsonic:${section}`)} /> },
    { view: 'jellyfin', label: t('online.jellyfin'), panel: <SourceServers kind="jellyfin" openSection={(section) => setView(`jellyfin:${section}`)} /> },
    { view: 'plex', label: t('online.plex'), panel: <SourceServers kind="plex" openSection={(section) => setView(`plex:${section}`)} /> },
    // only the shown one looks for hosts: it browses the network while it is mounted
    { view: 'nearby', label: t('online.nearby'), panel: view === 'nearby' && <RemoteListener /> },
    // only the shown section loads the libraries of its servers
    ...sourceKinds.flatMap((kind) =>
      sections.map((section) => ({
        view: `${kind}:${section}` as const,
        label: `${kind} ${section}`,
        panel: view === `${kind}:${section}` && <SourceLibrary kind={kind} section={section} />,
      }))
    ),
  ];

  return <ViewSwitcher views={views} current={view} setView={setView} tabs={false} />;
};

export default OnlineSources;
