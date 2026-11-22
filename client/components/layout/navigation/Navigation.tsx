import { Fragment, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import classNames from 'classnames';
import {
  MdAdd as AddIcon,
  MdFavorite as FavouritesIcon,
  MdFileUpload as ImportIcon,
  MdFormatListBulleted as PlaylistsIcon,
  MdHome as HomeIcon,
  MdEqualizer as EQIcon,
  MdKeyboardArrowDown as ChevronIcon,
  MdLibraryMusic as LibraryIcon,
  MdMusicNote as NowPlayingIcon,
  MdPlaylistPlay as PlaylistIcon,
  MdRadio as RadioIcon,
  MdDns as ServersIcon,
  MdWifiTethering as NearbyIcon,
  MdPublic as OnlineIcon,
  MdSettings as SettingsIcon,
} from 'react-icons/md';
import type { NavigationGroup, LibraryView, OnlineView, Tab } from '../../../domain/navigation';
import type { Playlist } from '@shared/types/playlists';
import { sourceCapabilities, type SourceKind } from '@shared/schemas/sources';
import { libraryViews, providers, sectionViews, sourceNames } from './navigation-items';
import { useDragReorder } from '../../../hooks/use-drag-reorder';
import style from './Navigation.scss';
import NameField from '../../ui/name-field';
import { useTranslation } from '../../../i18n';

interface NavigationProps {
  /** The spectrum of what plays, in a strip of its own between the playlists and the footer */
  spectrum?: ReactNode;
  /** Only the icons, in a narrow column: the medium size of the window */
  rail?: boolean;
  /** Called after an item took the app somewhere, so a drawer can close */
  onNavigate?: () => void;
  setTab?: (tab: Tab) => void;
  tab?: Tab;
  view?: LibraryView;
  onlineView?: OnlineView;
  libraryOpen?: boolean;
  onlineOpen?: boolean;
  /** The kinds of server that have a server of the user: only they show the sections of their library */
  sourceKinds?: SourceKind[];
  /** The providers that are folded: they show only their row */
  closedSources?: SourceKind[];
  loadSources?: () => void;
  /** The group whose welcome page is shown */
  overviewGroup?: NavigationGroup;
  openOverview?: (group: NavigationGroup) => void;
  playlistsOpen?: boolean;
  playlists?: Playlist[];
  playlistId?: number | null;
  openLibraryView?: (view: LibraryView) => void;
  openOnlineView?: (view: OnlineView) => void;
  setGroupOpen?: (group: NavigationGroup, open: boolean) => void;
  openPlaylist?: (id: number) => void;
  createPlaylist?: (name: string) => void;
  importPlaylists?: () => void;
  movePlaylist?: (id: number, toIndex: number) => void;
}

interface ItemProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
}

const Item = ({ label, icon, active = false, onClick }: ItemProps) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-current={active ? 'page' : undefined}
    className={classNames(style.item, { [style.active]: active })}
  >
    {icon}
    <span className={style.label}>{label}</span>
  </button>
);

interface OnlineItemProps {
  label: string;
  /** What names the row for a screen reader and in the tooltip, when the label alone does not say it */
  title?: string;
  Icon: IconType;
  current: boolean;
  /** Inside a provider: two levels in */
  nested?: boolean;
  onClick: () => void;
}

const OnlineItem = ({ label, title = label, Icon, current, nested = false, onClick }: OnlineItemProps) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    aria-current={current ? 'page' : undefined}
    className={classNames(style.item, style.child, { [style.nested]: nested, [style.active]: current })}
  >
    <Icon size={'12px'} />
    <span className={style.label}>{label}</span>
  </button>
);

interface GroupProps {
  label: string;
  icon: ReactNode;
  open: boolean;
  active?: boolean;
  count?: number;
  /** At least one server is set up in the group */
  indicator?: string;
  /** A group inside the online group: one level in, as the views are */
  nested?: boolean;
  onClick: () => void;
}

/** The row of a group that opens and closes, with the number of what is in it while it is closed, */
const Group = ({ label, icon, open, active = false, count, indicator, nested = false, onClick }: GroupProps) => (
  <div className={classNames(style.item, style.group, { [style.active]: active, [style.child]: nested })}>
    <button type="button" onClick={onClick} title={label} aria-expanded={open} className={style.groupToggle}>
      {icon}
      <span className={style.label}>{label}</span>
      {indicator && <span role="img" aria-label={indicator} title={indicator} className={style.indicator} />}
      {!open && count !== undefined && <span className={style.count}>{count}</span>}
      <ChevronIcon size={'16px'} className={classNames(style.chevron, { [style.closed]: !open })} />
    </button>
  </div>
);

function Navigation({
  spectrum,
  rail = false,
  onNavigate = () => {},
  setTab: setTabOf = () => {},
  tab = 'home',
  view = 'albums',
  onlineView = 'radio',
  libraryOpen = false,
  onlineOpen = false,
  sourceKinds = [],
  closedSources = ['subsonic', 'jellyfin', 'plex'],
  loadSources = () => {},
  overviewGroup = 'library',
  openOverview: openOverviewOf = () => {},
  playlistsOpen = false,
  playlists = [],
  playlistId = null,
  openLibraryView: openLibraryViewOf = () => {},
  openOnlineView: openOnlineViewOf = () => {},
  setGroupOpen = () => {},
  openPlaylist: openPlaylistOf = () => {},
  createPlaylist = () => {},
  importPlaylists = () => {},
  movePlaylist = () => {},
}: NavigationProps) {
  const { t } = useTranslation();
  const [name, setName] = useState<string | undefined>(undefined);

  // the servers say which sections the sidebar shows
  useEffect(() => {
    loadSources();
  }, []);

  const { itemProps, overIndex } = useDragReorder(movePlaylist);

  const setTab = (next: Tab) => {
    setTabOf(next);
    onNavigate();
  };
  const overviewShown = (group: NavigationGroup) => tab === 'overview' && overviewGroup === group;
  /** A folded group opens with its welcome page, an open one shows the page first and folds when the page is already shown */
  const clickGroup = (group: NavigationGroup, open: boolean) => {
    if (open && overviewShown(group)) return setGroupOpen(group, false);
    openOverviewOf(group);
  };
  const isOnline = (view: OnlineView) => tab === 'online-sources' && onlineView === view;

  /** The row of a provider that folds, the page of its servers, and the sections of its library once it has a server */
  const providerRows = ({ kind, serversView }: (typeof providers)[number]) => {
    const open = !closedSources.includes(kind);
    const sections = sourceKinds.includes(kind) ? sectionViews.filter(({ section }) => sourceCapabilities[kind].library?.sections.includes(section)) : [];
    const inside = isOnline(serversView) || sections.some(({ section }) => isOnline(`${kind}:${section}`));

    return (
      <Fragment key={kind}>
        <Group
          nested
          label={sourceNames[kind]}
          icon={<ServersIcon size={'12px'} />}
          open={open}
          active={overviewShown(kind) || (!open && inside)}
          indicator={sourceKinds.includes(kind) ? t('nav.serverConfigured') : undefined}
          onClick={() => clickGroup(kind, open)}
        />
        {open && (
          <OnlineItem
            nested
            label={t('nav.manageServers')}
            title={t('nav.sourceServers', { source: sourceNames[kind] })}
            Icon={ServersIcon}
            current={isOnline(serversView)}
            onClick={() => openOnlineView(serversView)}
          />
        )}
        {open &&
          sections.map(({ section, label, Icon }) => (
            <OnlineItem
              key={section}
              nested
              label={t(label)}
              title={t('nav.sourceSection', { source: sourceNames[kind], section: t(label) })}
              Icon={Icon}
              current={isOnline(`${kind}:${section}`)}
              onClick={() => openOnlineView(`${kind}:${section}`)}
            />
          ))}
      </Fragment>
    );
  };

  const openLibraryView = (next: LibraryView) => {
    openLibraryViewOf(next);
    onNavigate();
  };
  const openOnlineView = (next: OnlineView) => {
    openOnlineViewOf(next);
    onNavigate();
  };
  const openPlaylist = (id: number) => {
    openPlaylistOf(id);
    onNavigate();
  };

  const submit = () => {
    if (name?.trim()) createPlaylist(name.trim());
    setName(undefined);
  };

  const startPlaylist = () => {
    setGroupOpen('playlists', true);
    setName('');
  };

  return (
    <div className={classNames(style.navigation, { [style.rail]: rail })}>
      <div className={style.top}>
        <Item label={t('nav.home')} icon={<HomeIcon size={'14px'} />} active={tab === 'home'} onClick={() => setTab('home')} />
        <Item label={t('nav.nowPlaying')} icon={<NowPlayingIcon size={'14px'} />} active={tab === 'now-playing'} onClick={() => setTab('now-playing')} />
        <Group
          label={t('nav.library')}
          icon={<LibraryIcon size={'14px'} />}
          open={libraryOpen}
          active={overviewShown('library') || (tab === 'local' && !libraryOpen)}
          onClick={() => clickGroup('library', libraryOpen)}
        />
        {libraryOpen &&
          libraryViews.map(({ view: libraryView, label, Icon }) => (
            <button
              type="button"
              key={libraryView}
              title={t(label)}
              onClick={() => openLibraryView(libraryView)}
              aria-current={tab === 'local' && view === libraryView ? 'page' : undefined}
              className={classNames(style.item, style.child, { [style.active]: tab === 'local' && view === libraryView })}
            >
              <Icon size={'12px'} />
              <span className={style.label}>{t(label)}</span>
            </button>
          ))}
        <Group
          label={t('nav.online')}
          icon={<OnlineIcon size={'14px'} />}
          open={onlineOpen}
          active={overviewShown('online') || (tab === 'online-sources' && !onlineOpen)}
          onClick={() => clickGroup('online', onlineOpen)}
        />
        {onlineOpen && (
          <>
            <OnlineItem label={t('nav.radio')} Icon={RadioIcon} current={isOnline('radio')} onClick={() => openOnlineView('radio')} />
            {providers.map(providerRows)}
            <OnlineItem label={t('nav.nearby')} Icon={NearbyIcon} current={isOnline('nearby')} onClick={() => openOnlineView('nearby')} />
          </>
        )}
        <Item label={t('nav.liked')} icon={<FavouritesIcon size={'14px'} />} active={tab === 'favourites'} onClick={() => setTab('favourites')} />
        <Group
          label={t('nav.playlists')}
          icon={<PlaylistsIcon size={'14px'} />}
          open={playlistsOpen}
          count={playlists.length}
          active={overviewShown('playlists')}
          onClick={() => clickGroup('playlists', playlistsOpen)}
        />
      </div>
      <div className={style.playlists}>
        {playlistsOpen &&
          playlists.map(({ id, name: playlistName }, index) => (
            <button
              type="button"
              key={id}
              title={playlistName}
              onClick={() => openPlaylist(id)}
              aria-current={tab === 'playlist' && playlistId === id ? 'page' : undefined}
              className={classNames(style.item, style.child, {
                [style.active]: tab === 'playlist' && playlistId === id,
                [style.dropTarget]: overIndex === index,
              })}
              {...itemProps(id, index)}
            >
              <PlaylistIcon size={'12px'} />
              <span className={style.label}>{playlistName}</span>
            </button>
          ))}
        {playlistsOpen && name !== undefined && (
          <NameField
            autoFocus
            className={style.newPlaylist}
            value={name}
            label={t('playlists.newName')}
            onChange={setName}
            onSubmit={submit}
            onCancel={() => setName(undefined)}
            onBlur={() => setName(undefined)}
          />
        )}
        {playlistsOpen && (
          <>
            <button type="button" title={t('nav.newPlaylist')} onClick={startPlaylist} className={classNames(style.item, style.child)}>
              <AddIcon size={'12px'} />
              <span className={style.label}>{t('nav.newPlaylist')}</span>
            </button>
            <button type="button" title={t('nav.importPlaylists')} onClick={importPlaylists} className={classNames(style.item, style.child)}>
              <ImportIcon size={'12px'} />
              <span className={style.label}>{t('nav.importPlaylists')}</span>
            </button>
          </>
        )}
      </div>
      {spectrum && <div className={style.spectrum}>{spectrum}</div>}
      <div className={style.footer}>
        <Item label={t('nav.equalizer')} icon={<EQIcon size={'14px'} />} active={tab === 'equalizer'} onClick={() => setTab('equalizer')} />
        <Item label={t('nav.settings')} icon={<SettingsIcon size={'14px'} />} active={tab === 'settings'} onClick={() => setTab('settings')} />
      </div>
    </div>
  );
}

export default Navigation;
