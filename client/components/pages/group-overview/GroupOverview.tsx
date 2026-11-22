import type { IconType } from 'react-icons';
import { MdDns as ServersIcon, MdPlaylistPlay as PlaylistIcon, MdRadio as RadioIcon, MdWifiTethering as NearbyIcon } from 'react-icons/md';
import type { Playlist } from '@shared/types/playlists';
import { sourceCapabilities, type SourceKind } from '@shared/schemas/sources';
import type { LibraryView, NavigationGroup, OnlineView } from '../../../domain/navigation';
import { libraryViews, providers, sectionViews, sourceNames } from '../../layout/navigation/navigation-items';
import { useTranslation } from '../../../i18n';
import style from './GroupOverview.scss';

interface GroupOverviewProps {
  group?: NavigationGroup;
  /** The kinds of server that have a server of the user */
  sourceKinds?: SourceKind[];
  playlists?: Playlist[];
  openLibraryView?: (view: LibraryView) => void;
  openOnlineView?: (view: OnlineView) => void;
  openPlaylist?: (id: number) => void;
  openOverview?: (group: NavigationGroup) => void;
}

const topLevelTexts = {
  library: { title: 'nav.library', description: 'overview.library' },
  online: { title: 'nav.online', description: 'overview.online' },
  playlists: { title: 'nav.playlists', description: 'overview.playlists' },
} as const;

interface Entry {
  key: string;
  label: string;
  Icon: IconType;
  onClick: () => void;
}

/** The welcome page of a group of the sidebar: what is in it, to open from the page as well as from the sidebar */
function GroupOverview({
  group = 'library',
  sourceKinds = [],
  playlists = [],
  openLibraryView = () => {},
  openOnlineView = () => {},
  openPlaylist = () => {},
  openOverview = () => {},
}: GroupOverviewProps) {
  const { t } = useTranslation();

  const source = providers.find(({ kind }) => kind === group);
  const sections =
    source && sourceKinds.includes(source.kind)
      ? sectionViews
          .filter(({ section }) => sourceCapabilities[source.kind].library?.sections.includes(section))
          .map(({ section, label, Icon }) => ({ key: section, label: t(label), Icon, onClick: () => openOnlineView(`${source.kind}:${section}`) }))
      : [];

  const entries: Entry[] = [
    ...(group === 'library' ? libraryViews.map(({ view, label, Icon }) => ({ key: view, label: t(label), Icon, onClick: () => openLibraryView(view) })) : []),
    ...(group === 'online'
      ? [
          { key: 'radio', label: t('nav.radio'), Icon: RadioIcon, onClick: () => openOnlineView('radio') },
          ...providers.map((provider) => ({
            key: provider.kind,
            label: sourceNames[provider.kind],
            Icon: ServersIcon,
            onClick: () => openOverview(provider.kind),
          })),
          { key: 'nearby', label: t('nav.nearby'), Icon: NearbyIcon, onClick: () => openOnlineView('nearby') },
        ]
      : []),
    ...(source ? [{ key: 'servers', label: t('nav.manageServers'), Icon: ServersIcon, onClick: () => openOnlineView(source.serversView) }] : []),
    ...sections,
    ...(group === 'playlists' ? playlists.map(({ id, name }) => ({ key: String(id), label: name, Icon: PlaylistIcon, onClick: () => openPlaylist(id) })) : []),
  ];
  const title = source ? sourceNames[source.kind] : t(topLevelTexts[group === 'online' || group === 'playlists' ? group : 'library'].title);
  const description = source
    ? t('overview.source', { source: sourceNames[source.kind] })
    : t(topLevelTexts[group === 'online' || group === 'playlists' ? group : 'library'].description);

  return (
    <div className={style.overview}>
      <div className={style.contents}>
        <h1 className={style.title}>{title}</h1>
        <p className={style.description}>{description}</p>
        {entries.length === 0 && <p className={style.empty}>{t('overview.playlistsEmpty')}</p>}
        <ul className={style.entries}>
          {entries.map(({ key, label, Icon, onClick }) => (
            <li key={key}>
              <button type="button" className={style.entry} onClick={onClick}>
                <Icon size={'36px'} />
                <span className={style.label}>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default GroupOverview;
