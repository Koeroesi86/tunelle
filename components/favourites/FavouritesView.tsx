import classNames from 'classnames';
import { MdAlbum, MdFavorite, MdMusicNote, MdPlayArrow as PlayIcon, MdRadio, MdShuffle, MdWarningAmber } from 'react-icons/md';
import type { Favourite } from '@shared/types/favourites';
import type { Track } from '@shared/types/library';
import type { RadioStation } from '@shared/types/radio';
import type { FavouritesOrder as Order, FavouritesSource as Source } from '../../client/redux/types';
import { toRadioTrack } from '../../client/utils/radio-track';
import { getFavouriteTracks } from '../../client/utils/favourite-tracks';
import { shuffled } from '../../client/utils/shuffled';
import { useTranslation } from '../../client/i18n';
import type { MessageKey, Translator } from '../../locales/translate';
import style from './FavouritesView.scss';
import AudioFormatBadge from '../audio-format-badge';
import FavouriteButton from '../favourite-button';
import AddToQueue from '../add-to-queue';

const sources: Source[] = ['local', 'online'];
const orders: Order[] = ['recent', 'name', 'details'];
const orderLabels = { recent: 'favourites.sortRecent', name: 'favourites.sortName', details: 'favourites.sortDetails' } as const;
const kindIcons = { track: MdMusicNote, album: MdAlbum, station: MdRadio } as const;
const kindTitles = { track: 'favourites.track', album: 'favourites.album', station: 'favourites.station' } as const;
const day = 86_400_000;

interface FavouritesViewProps {
  favourites: Favourite[];
  playTracks: (tracks: Track[]) => void;
  playStation: (station: RadioStation) => void;
  source: Source;
  order: Order;
  setSource: (source: Source) => void;
  setOrder: (order: Order) => void;
}

const describe = (favourite: Favourite, { t }: Translator) => {
  switch (favourite.kind) {
    case 'track':
      return [favourite.snapshot.artist, favourite.snapshot.album].filter(Boolean).join(' · ');
    case 'album':
      return [favourite.snapshot.artist, t('favourites.album')].filter(Boolean).join(' · ');
    default:
      return [favourite.snapshot.country, ...favourite.snapshot.tags.slice(0, 3)].filter(Boolean).join(' · ');
  }
};

/** What the badge of a favourite shows the format of: a track, or a station as the track it plays as; an album has none */
const formatTrack = (favourite: Favourite) => {
  switch (favourite.kind) {
    case 'track':
      return favourite.snapshot;
    case 'station':
      return toRadioTrack(favourite.snapshot);
    default:
      return undefined;
  }
};

const nameOf = (favourite: Favourite) => {
  switch (favourite.kind) {
    case 'track':
    case 'album':
      return favourite.snapshot.title;
    default:
      return favourite.snapshot.name;
  }
};

const sourceOf = ({ source }: Favourite): Source => (source === 'local' ? 'local' : 'online');

/** The comparison of an order: the newest first, or by the name or the details as the language sorts them */
const comparator = (order: Order, translator: Translator) => {
  const text = (value: string, other: string) => value.localeCompare(other, translator.language);

  switch (order) {
    case 'name':
      return (a: Favourite, b: Favourite) => text(nameOf(a), nameOf(b));
    case 'details':
      return (a: Favourite, b: Favourite) => text(describe(a, translator), describe(b, translator));
    default:
      return (a: Favourite, b: Favourite) => b.addedAt - a.addedAt;
  }
};

/** When it was liked: "today" or "3 days ago" for the first two weeks, then the date */
const likedOn = (addedAt: number, now: number, language: string) => {
  const days = Math.max(Math.floor((now - addedAt) / day), 0);

  return days < 14
    ? new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(-days, 'day')
    : new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(addedAt);
};

interface RowProps {
  favourite: Favourite;
  play: (favourites: Favourite[]) => void;
}

const Row = ({ favourite, play }: RowProps) => {
  const translator = useTranslation();
  const { t, language } = translator;
  const KindIcon = kindIcons[favourite.kind];

  return (
    <div className={classNames(style.row, { [style.unavailable]: !favourite.available })} onDoubleClick={() => favourite.available && play([favourite])}>
      <FavouriteButton item={favourite} />
      <span className={classNames(style.kind, style[favourite.kind])} title={t(kindTitles[favourite.kind])}>
        <KindIcon size="14px" />
      </span>
      <span className={style.name} title={nameOf(favourite)}>
        {nameOf(favourite)}
      </span>
      <span className={style.details}>
        {favourite.available ? (
          describe(favourite, translator)
        ) : (
          <span className={style.warning}>
            <MdWarningAmber size="13px" aria-hidden />
            {t('favourites.unavailable')}
          </span>
        )}
      </span>
      <span>
        <AudioFormatBadge track={formatTrack(favourite)} />
      </span>
      <span className={style.actions}>
        {favourite.available && favourite.kind !== 'station' && <AddToQueue getTracks={() => getFavouriteTracks([favourite])} />}
        <button disabled={!favourite.available} aria-label={t('player.play')} onClick={() => play([favourite])}>
          <PlayIcon size="14px" />
        </button>
      </span>
      <span className={style.liked}>{likedOn(favourite.addedAt, Date.now(), language)}</span>
    </div>
  );
};

interface FavouritesViewProps {
  favourites: Favourite[];
  playTracks: (tracks: Track[]) => void;
  playStation: (station: RadioStation) => void;
}

const FavouritesView = ({ favourites, playTracks, playStation, source, order, setSource, setOrder }: FavouritesViewProps) => {
  const translator = useTranslation();
  const { t } = translator;

  // a single station plays as the station of the radio, anything else is a queue of what the favourites play
  const play = ([first, ...others]: Favourite[], shuffle = false) =>
    first.kind === 'station' && others.length === 0
      ? playStation(first.snapshot)
      : getFavouriteTracks([first, ...others])
          .then((tracks) => playTracks(shuffle ? shuffled(tracks) : tracks))
          .catch(console.error);

  const sides = {
    local: favourites.filter((favourite) => sourceOf(favourite) === 'local'),
    online: favourites.filter((favourite) => sourceOf(favourite) === 'online'),
  };
  const side = sides[source].toSorted(comparator(order, translator));
  const playable = side.filter(({ available }) => available);
  const gone = side.filter(({ available }) => !available);
  const count = (kind: string) => side.filter((favourite) => favourite.kind === kind).length;
  // a local side is told by its tracks and albums, an online one by its stations
  const stats: [MessageKey, number][] =
    source === 'local'
      ? [
          ['favourites.items', side.length],
          ['favourites.tracks', count('track')],
          ['favourites.albums', count('album')],
        ]
      : [['favourites.stations', side.length]];

  return (
    <div className={style.favourites}>
      <div className={style.hero}>
        <div className={style.heart}>
          <MdFavorite size="44px" />
        </div>
        <div className={style.summary}>
          <h1>{t('nav.liked')}</h1>
          <div className={style.stats}>
            {stats
              .filter(([, value]) => value > 0)
              .map(([key, value]) => (
                <span key={key}>{t(key, { count: value })}</span>
              ))}
            {gone.length > 0 && <span className={style.warning}>{t('favourites.unavailableCount', { count: gone.length })}</span>}
          </div>
          <div className={style.buttons}>
            <button className={style.primary} disabled={playable.length === 0} onClick={() => play(playable)}>
              <PlayIcon size="14px" />
              {t(source === 'local' ? 'favourites.playAllLocal' : 'favourites.playAllOnline')}
            </button>
            <button disabled={playable.length === 0} onClick={() => play(playable, true)}>
              <MdShuffle size="14px" />
              {t('favourites.shuffle')}
            </button>
          </div>
        </div>
      </div>
      <div className={style.controls}>
        <div className={style.switch} role="group" aria-label={t('favourites.source')}>
          {sources.map((name) => (
            <button key={name} type="button" aria-pressed={source === name} onClick={() => setSource(name)}>
              {t(name === 'local' ? 'favourites.local' : 'favourites.online')}
              <small>{sides[name].length}</small>
            </button>
          ))}
        </div>
        <select
          className={style.order}
          aria-label={t('favourites.sort')}
          value={order}
          onChange={(event) => setOrder(orders.find((name) => name === event.target.value) ?? 'recent')}
        >
          {orders.map((name) => (
            <option key={name} value={name}>
              {t(orderLabels[name])}
            </option>
          ))}
        </select>
      </div>
      <div className={style.header} aria-hidden>
        <div className={classNames(style.row, style.columns)}>
          <span />
          <span />
          <span>{t('favourites.column.name')}</span>
          <span>{t('favourites.column.details')}</span>
          <span>{t('favourites.column.format')}</span>
          <span />
          <span className={style.liked}>{t('favourites.column.liked')}</span>
        </div>
      </div>
      <div className={style.contents}>
        {favourites.length === 0 && <div className={style.message}>{t('favourites.empty')}</div>}
        {favourites.length > 0 && side.length === 0 && <div className={style.message}>{t('favourites.emptySection')}</div>}
        {side
          .filter(({ available }) => available)
          .map((favourite) => (
            <Row key={`${favourite.source}/${favourite.kind}/${favourite.id}`} favourite={favourite} play={play} />
          ))}
        {gone.length > 0 && (
          <div className={style.goneHeading}>
            <MdWarningAmber size="14px" aria-hidden />
            <b>{t('favourites.unavailable')}</b>
            {source === 'local' && <small>{t('favourites.moveNote')}</small>}
          </div>
        )}
        {gone.map((favourite) => (
          <Row key={`${favourite.source}/${favourite.kind}/${favourite.id}`} favourite={favourite} play={play} />
        ))}
      </div>
    </div>
  );
};

export default FavouritesView;
