import { useState } from 'react';
import classNames from 'classnames';
import { MdDeleteSweep as ClearIcon, MdFavorite as LikedIcon, MdPlayArrow as PlayIcon, MdRadio as RadioIcon } from 'react-icons/md';
import type { Favourite, HistoryItem } from '@shared/types/favourites';
import type { Track } from '@shared/types/library';
import type { Playlist } from '@shared/types/playlists';
import type { RadioStation } from '@shared/types/radio';
import { getCoverUrl } from '../../client/utils/cover-url';
import { getFavouriteTracks } from '../../client/utils/favourite-tracks';
import { isPlayingItem } from '../../client/utils/history';
import { useTranslation } from '../../client/i18n';
import { getPlaylistTracks } from '../../client/utils/playlists';
import { radioUuidOf, toRadioTrack } from '../../client/utils/radio-track';
import style from './HomeView.scss';
import AudioFormatBadge from '../audio-format-badge';
import StationLogo from '../station-logo';
import Confirm from '../confirm';
import FavouriteButton from '../favourite-button';
import Time from '../time';

interface HomeViewProps {
  history: HistoryItem[];
  currentSong: Track | null;
  isPlaying?: boolean;
  currentTime?: number;
  favourites?: Favourite[];
  playlists?: Playlist[];
  hasFolders?: boolean;
  playTracks: (tracks: Track[]) => void;
  playStation: (station: RadioStation) => void;
  clearHistory: () => void;
  resume?: () => void;
  addFolder?: () => void;
}

/** What the start row and the station list have room for */
const maxStartTiles = 4;
const maxStations = 4;
const maxCovers = 4;

interface StartTile {
  key: string;
  name: string;
  count: number;
  /** The covers of the tracks of a playlist, the liked tile has none */
  covers: string[];
  liked: boolean;
  tracks: () => Promise<Track[]>;
}

/** Liked first, then the playlists that have something to play, as many as the row has room for */
const startTilesOf = (favourites: Favourite[], playlists: Playlist[], likedName: string): StartTile[] => {
  const likedTracks = favourites.filter(({ kind, available }) => kind === 'track' && available);
  const liked: StartTile[] = likedTracks.length
    ? [{ key: 'liked', name: likedName, count: likedTracks.length, covers: [], liked: true, tracks: () => getFavouriteTracks(likedTracks) }]
    : [];
  const lists = playlists.flatMap((playlist): StartTile[] => {
    const tracks = getPlaylistTracks(playlist);
    const covers = [...new Set(tracks.flatMap(({ picture }) => (picture ? [picture] : [])))].slice(0, maxCovers);

    return tracks.length
      ? [{ key: `playlist/${playlist.id}`, name: playlist.name, count: tracks.length, covers, liked: false, tracks: () => Promise.resolve(tracks) }]
      : [];
  });

  return [...liked, ...lists].slice(0, maxStartTiles);
};

/** The favourite stations first, then the ones that were played, each once */
const stationsOf = (favourites: Favourite[], history: HistoryItem[]): RadioStation[] =>
  [...favourites, ...history]
    .flatMap((item) => (item.kind === 'station' && item.available ? [item.snapshot] : []))
    .filter((station, index, all) => all.findIndex(({ uuid }) => uuid === station.uuid) === index)
    .slice(0, maxStations);

const nameOf = (item: HistoryItem) => (item.kind === 'station' ? item.snapshot.name : item.kind === 'track' ? item.snapshot.title : '');

const HomeView = ({
  history,
  currentSong,
  isPlaying = true,
  currentTime = 0,
  favourites = [],
  playlists = [],
  hasFolders = true,
  playTracks,
  playStation,
  clearHistory,
  resume = () => {},
  addFolder = () => {},
}: HomeViewProps) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const startTiles = startTilesOf(favourites, playlists, t('home.liked'));
  const stations = stationsOf(favourites, history);

  const play = (item: HistoryItem) => (item.kind === 'station' ? playStation(item.snapshot) : getFavouriteTracks([item]).then(playTracks).catch(console.error));
  const playTile = ({ tracks }: StartTile) => tracks().then(playTracks).catch(console.error);

  return (
    <div className={style.home}>
      <div className={style.contents}>
        {!hasFolders && (
          <div className={style.emptyLibrary}>
            <div className={style.emptyTitle}>{t('home.libraryEmpty')}</div>
            <div className={style.emptyHint}>{t('home.libraryEmptyHint')}</div>
            <button type="button" className={style.pill} onClick={addFolder}>
              {t('home.addFolder')}
            </button>
          </div>
        )}
        {currentSong && !isPlaying && (
          <div className={style.continue}>
            <div className={style.continueCover} style={currentSong.picture ? { backgroundImage: `url("${getCoverUrl(currentSong.picture)}")` } : undefined} />
            <div className={style.continueText}>
              <span className={style.continueLabel}>{t('home.continue')}</span>
              <span className={style.continueTitle}>{currentSong.title}</span>
              <span className={style.continueDetails}>
                {radioUuidOf(currentSong.path) ? t('home.station') : [currentSong.artist, currentSong.album].filter(Boolean).join(' · ')}
              </span>
            </div>
            {!!currentSong.duration && !radioUuidOf(currentSong.path) && (
              <span className={style.position}>
                <Time seconds={currentTime} /> / <Time seconds={currentSong.duration} />
              </span>
            )}
            <button type="button" className={style.pill} onClick={resume}>
              <PlayIcon size="16px" />
              {t('home.resume')}
            </button>
          </div>
        )}
        {startTiles.length > 0 && (
          <div className={style.startTiles}>
            {startTiles.map((tile) => (
              <button key={tile.key} type="button" className={style.startTile} title={t('player.play')} onClick={() => playTile(tile)}>
                {tile.liked ? (
                  <span className={classNames(style.mosaic, style.likedMosaic)}>
                    <LikedIcon size="16px" />
                  </span>
                ) : (
                  <span className={style.mosaic}>
                    {Array.from({ length: maxCovers }, (_, index) => (
                      <i key={index} style={tile.covers[index] ? { backgroundImage: `url("${getCoverUrl(tile.covers[index])}")` } : undefined} />
                    ))}
                  </span>
                )}
                <span className={style.startText}>
                  <span className={style.startName}>{tile.name}</span>
                  <span className={style.startCount}>{t('playlists.trackCount', { count: tile.count })}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className={classNames(style.columns, { [style.withStations]: stations.length > 0 })}>
          <div className={style.recent}>
            <div className={style.sectionHeader}>
              <span className={style.sectionTitle}>{t('home.recentlyPlayed')}</span>
              <button type="button" className={style.clearButton} disabled={history.length === 0} onClick={() => setConfirming(true)}>
                <ClearIcon size={'14px'} />
                {t('home.clear')}
              </button>
            </div>
            <div className={style.recentList}>
              {history.length === 0 && <div className={style.message}>{t('home.empty')}</div>}
              {history.map((item) => (
                <div
                  key={`${item.source}/${item.kind}/${item.id}`}
                  className={classNames(style.item, { [style.unavailable]: !item.available, [style.current]: isPlayingItem(item, currentSong) })}
                  onDoubleClick={() => item.available && play(item)}
                >
                  <div
                    className={style.cover}
                    style={item.kind === 'track' && item.snapshot.picture ? { backgroundImage: `url("${getCoverUrl(item.snapshot.picture)}")` } : undefined}
                  />
                  <span className={style.name} title={nameOf(item)}>
                    {nameOf(item)}
                  </span>
                  <span className={style.artist}>{item.kind === 'track' ? item.snapshot.artist : item.kind === 'station' ? item.snapshot.country : ''}</span>
                  <span className={style.album}>
                    {!item.available ? t('home.unavailable') : item.kind === 'track' ? item.snapshot.album : t('home.station')}
                  </span>
                  <span className={style.format}>
                    <AudioFormatBadge track={item.kind === 'station' ? toRadioTrack(item.snapshot) : item.kind === 'track' ? item.snapshot : undefined} />
                  </span>
                  <span className={style.duration}>{item.kind === 'track' && item.snapshot.duration ? <Time seconds={item.snapshot.duration} /> : null}</span>
                  <FavouriteButton item={item} />
                  <button className={style.playButton} disabled={!item.available} aria-label={t('player.play')} onClick={() => play(item)}>
                    <PlayIcon size="12px" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {stations.length > 0 && (
            <div className={style.stations}>
              <div className={style.sectionHeader}>
                <span className={style.sectionTitle}>{t('home.radioStations')}</span>
              </div>
              <div className={style.stationTiles}>
                {stations.map((station) => (
                  <button key={station.uuid} type="button" className={style.stationTile} title={t('player.play')} onClick={() => playStation(station)}>
                    <span className={style.stationLogo}>
                      <StationLogo uuid={station.uuid} hasLogo={station.hasLogo} fallback={<RadioIcon size="18px" aria-hidden />} />
                    </span>
                    <span className={style.stationText}>
                      <span className={style.stationName}>{station.name}</span>
                      <span className={style.stationDetails}>
                        <span className={style.stationCountry}>{station.country || t('home.station')}</span>
                        <AudioFormatBadge track={toRadioTrack(station)} />
                      </span>
                    </span>
                    <span className={style.stationPlay} aria-hidden>
                      <PlayIcon size="12px" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <Confirm
        message={confirming ? t('home.clearConfirm') : null}
        confirm={() => {
          clearHistory();
          setConfirming(false);
        }}
        cancel={() => setConfirming(false)}
      />
    </div>
  );
};

export default HomeView;
