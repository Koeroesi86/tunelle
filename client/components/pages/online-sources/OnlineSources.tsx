import type { ReactNode } from 'react';
import { useTranslation } from '../../../i18n';
import type { LibraryKind, SourceKind } from '@shared/schemas/sources';
import type { OnlineView } from '../../../domain/navigation';
import ViewSwitcher from '../../ui/view-switcher/ViewSwitcher';
import type { ViewItem } from '../../ui/view-switcher/ViewSwitcher';

interface OnlineSourcesProps {
  view: OnlineView;
  setView: (view: OnlineView) => void;
  radio: ReactNode;
  /** The servers of a kind, which open one of the sections of their library */
  renderServers: (kind: SourceKind, openSection: (section: LibraryKind) => void) => ReactNode;
  renderLibrary: (kind: SourceKind, section: LibraryKind) => ReactNode;
  /** The hosts nearby, which are looked for while it is mounted */
  nearby: ReactNode;
}

const sourceKinds: SourceKind[] = ['subsonic', 'jellyfin', 'plex'];
const sections: LibraryKind[] = ['albums', 'artists', 'tracks'];

const OnlineSources = ({ view, setView, radio, renderServers, renderLibrary, nearby }: OnlineSourcesProps) => {
  const { t } = useTranslation();
  const views: ViewItem<OnlineView>[] = [
    { view: 'radio', label: t('online.radio'), panel: radio },
    { view: 'servers', label: t('online.servers'), panel: renderServers('subsonic', (section) => setView(`subsonic:${section}`)) },
    { view: 'jellyfin', label: t('online.jellyfin'), panel: renderServers('jellyfin', (section) => setView(`jellyfin:${section}`)) },
    { view: 'plex', label: t('online.plex'), panel: renderServers('plex', (section) => setView(`plex:${section}`)) },
    // only the shown one looks for hosts: it browses the network while it is mounted
    { view: 'nearby', label: t('online.nearby'), panel: view === 'nearby' && nearby },
    // only the shown section loads the libraries of its servers
    ...sourceKinds.flatMap((kind) =>
      sections.map((section) => ({
        view: `${kind}:${section}` as const,
        label: `${kind} ${section}`,
        panel: view === `${kind}:${section}` && renderLibrary(kind, section),
      }))
    ),
  ];

  return <ViewSwitcher views={views} current={view} setView={setView} tabs={false} />;
};

export default OnlineSources;
