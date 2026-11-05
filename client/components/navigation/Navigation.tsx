import { useState } from 'react';
import type { ReactNode } from 'react';
import classNames from 'classnames';
import {
  MdAdd as AddIcon,
  MdAlbum as AlbumsIcon,
  MdAudiotrack as TracksIcon,
  MdFavorite as FavouritesIcon,
  MdFolder as FoldersIcon,
  MdFormatListBulleted as PlaylistsIcon,
  MdGroup as AlbumArtistsIcon,
  MdHome as HomeIcon,
  MdEqualizer as EQIcon,
  MdKeyboardArrowDown as ChevronIcon,
  MdLibraryMusic as LibraryIcon,
  MdLocalOffer as GenresIcon,
  MdMusicNote as NowPlayingIcon,
  MdPerson as ArtistsIcon,
  MdPlaylistPlay as PlaylistIcon,
  MdRadio as RadioIcon,
  MdSettings as SettingsIcon,
} from 'react-icons/md';
import type { NavigationGroup, LibraryView, Tab } from '../../redux/types';
import type { Playlist } from '@shared/types/playlists';
import { useDragReorder } from '../../hooks/use-drag-reorder';
import style from './Navigation.scss';
import NameField from '../name-field';
import { useTranslation } from '../../i18n';

interface NavigationProps {
  /** The spectrum of what plays, in a strip of its own between the playlists and the footer */
  spectrum?: ReactNode;
  setTab?: (tab: Tab) => void;
  tab?: Tab;
  view?: LibraryView;
  libraryOpen?: boolean;
  playlistsOpen?: boolean;
  playlists?: Playlist[];
  playlistId?: number | null;
  openLibraryView?: (view: LibraryView) => void;
  setGroupOpen?: (group: NavigationGroup, open: boolean) => void;
  openPlaylist?: (id: number) => void;
  createPlaylist?: (name: string) => void;
  movePlaylist?: (id: number, toIndex: number) => void;
}

const libraryViews = [
  { view: 'albums', label: 'library.albums', Icon: AlbumsIcon },
  { view: 'artists', label: 'library.artists', Icon: ArtistsIcon },
  { view: 'albumArtists', label: 'library.albumArtists', Icon: AlbumArtistsIcon },
  { view: 'genres', label: 'library.genres', Icon: GenresIcon },
  { view: 'tracks', label: 'library.songs', Icon: TracksIcon },
  { view: 'folders', label: 'library.folders', Icon: FoldersIcon },
] as const;

interface ItemProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
}

const Item = ({ label, icon, active = false, onClick }: ItemProps) => (
  <div onClick={onClick} className={classNames(style.item, { [style.active]: active })}>
    {icon}
    <span className={style.label}>{label}</span>
  </div>
);

interface GroupProps {
  label: string;
  icon: ReactNode;
  open: boolean;
  active?: boolean;
  count?: number;
  onClick: () => void;
  action?: ReactNode;
}

/** The row of a group that opens and closes, with the number of what is in it while it is closed, and an action of its own */
const Group = ({ label, icon, open, active = false, count, onClick, action }: GroupProps) => (
  <div onClick={onClick} aria-expanded={open} className={classNames(style.item, style.group, { [style.active]: active })}>
    {icon}
    <span className={style.label}>{label}</span>
    {!open && count !== undefined && <span className={style.count}>{count}</span>}
    {action}
    <ChevronIcon size={'16px'} className={classNames(style.chevron, { [style.closed]: !open })} />
  </div>
);

function Navigation({
  spectrum,
  setTab = () => {},
  tab = 'home',
  view = 'albums',
  libraryOpen = false,
  playlistsOpen = true,
  playlists = [],
  playlistId = null,
  openLibraryView = () => {},
  setGroupOpen = () => {},
  openPlaylist = () => {},
  createPlaylist = () => {},
  movePlaylist = () => {},
}: NavigationProps) {
  const { t } = useTranslation();
  const [name, setName] = useState<string | undefined>(undefined);
  const { itemProps, overIndex } = useDragReorder(movePlaylist);

  const submit = () => {
    if (name?.trim()) createPlaylist(name.trim());
    setName(undefined);
  };

  // opening the group shows the library as well, closing it keeps where the app is
  const toggleLibrary = () => {
    setGroupOpen('library', !libraryOpen);
    if (!libraryOpen) setTab('local');
  };

  const startPlaylist = () => {
    setGroupOpen('playlists', true);
    setName('');
  };

  return (
    <div className={style.navigation}>
      <div className={style.top}>
        <Item label={t('nav.home')} icon={<HomeIcon size={'14px'} />} active={tab === 'home'} onClick={() => setTab('home')} />
        <Item label={t('nav.nowPlaying')} icon={<NowPlayingIcon size={'14px'} />} active={tab === 'now-playing'} onClick={() => setTab('now-playing')} />
        <Group
          label={t('nav.library')}
          icon={<LibraryIcon size={'14px'} />}
          open={libraryOpen}
          active={tab === 'local' && !libraryOpen}
          onClick={toggleLibrary}
        />
        {libraryOpen &&
          libraryViews.map(({ view: libraryView, label, Icon }) => (
            <div
              key={libraryView}
              onClick={() => openLibraryView(libraryView)}
              className={classNames(style.item, style.child, { [style.active]: tab === 'local' && view === libraryView })}
            >
              <Icon size={'12px'} />
              <span className={style.label}>{t(label)}</span>
            </div>
          ))}
        <Item label={t('nav.radio')} icon={<RadioIcon size={'14px'} />} active={tab === 'online-sources'} onClick={() => setTab('online-sources')} />
        <Item label={t('nav.liked')} icon={<FavouritesIcon size={'14px'} />} active={tab === 'favourites'} onClick={() => setTab('favourites')} />
        <Group
          label={t('nav.playlists')}
          icon={<PlaylistsIcon size={'14px'} />}
          open={playlistsOpen}
          count={playlists.length}
          onClick={() => setGroupOpen('playlists', !playlistsOpen)}
          action={
            <button
              type="button"
              className={style.add}
              title={t('nav.newPlaylist')}
              aria-label={t('nav.newPlaylist')}
              onClick={(event) => {
                event.stopPropagation();
                startPlaylist();
              }}
            >
              <AddIcon size={'14px'} />
            </button>
          }
        />
      </div>
      <div className={style.playlists}>
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
        {playlistsOpen &&
          playlists.map(({ id, name: playlistName }, index) => (
            <div
              key={id}
              title={playlistName}
              onClick={() => openPlaylist(id)}
              className={classNames(style.item, style.child, {
                [style.active]: tab === 'playlist' && playlistId === id,
                [style.dropTarget]: overIndex === index,
              })}
              {...itemProps(id, index)}
            >
              <PlaylistIcon size={'12px'} />
              <span className={style.label}>{playlistName}</span>
            </div>
          ))}
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
