import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import classNames from 'classnames';
import { MdPlayArrow as PlayIcon } from 'react-icons/md';
import type { Track } from '@shared/types/library';
import { sourceBrowseSchema, toSourcePath } from '@shared/schemas/sources';
import type { SourceAlbum, SourceArtist, SourceBrowse, SourceBrowseResult, SourceSearchResult, SourceServerInfo } from '@shared/schemas/sources';
import type { SourcesState } from '../../../redux/sources/reducer';
import { browseKey } from '../../../redux/sources/reducer';
import { useTranslation } from '../../../i18n';
import { localUrl } from '../../../services/local-url';
import style from './SourceServers.scss';

interface SourceServersProps {
  state: SourcesState;
  load: () => void;
  save: (server: Record<string, unknown>) => void;
  remove: (id: string) => void;
  readCertificate: (url: string) => void;
  clearCertificate: () => void;
  browse: (request: SourceBrowse) => void;
  play: (tracks: Track[], track: Track) => void;
}

/** The wrong user or password, which the page words in its language */
const wrongLogin = 40;

const isArtists = (result: SourceBrowseResult | undefined): result is SourceArtist[] => Array.isArray(result) && result.every((item) => 'albumCount' in item);
const isAlbums = (result: SourceBrowseResult | undefined): result is SourceAlbum[] => Array.isArray(result) && result.every((item) => 'songCount' in item);
const isTracks = (result: SourceBrowseResult | undefined): result is Track[] => Array.isArray(result) && result.every((item) => 'path' in item);
const isSearch = (result: SourceBrowseResult | undefined): result is SourceSearchResult => result !== undefined && !Array.isArray(result);

const AddServer = ({ state, save, readCertificate, clearCertificate }: Pick<SourceServersProps, 'state' | 'save' | 'readCertificate' | 'clearCertificate'>) => {
  const { t } = useTranslation();
  const { saving, failure, certificate } = state;
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '' });
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value }),
  });
  const valid = Object.values(form).every((value) => value.trim() !== '');
  const insecure = form.url.trim().toLowerCase().startsWith('http:');

  const submit = (event: FormEvent, approved?: string) => {
    event.preventDefault();
    if (valid && !saving) save({ id: crypto.randomUUID(), kind: 'subsonic', ...form, certificate: approved });
  };

  return (
    <div className={style.tile}>
      <div className={style.sectionTitle}>{t('sources.add')}</div>
      <div className={style.hint}>{t('sources.addHint')}</div>
      <form className={style.form} onSubmit={(event) => submit(event, certificate?.certificate)}>
        <input aria-label={t('sources.name')} placeholder={t('sources.name')} autoComplete="off" {...field('name')} />
        <input aria-label={t('sources.url')} placeholder="https://music.example.com" autoComplete="off" spellCheck={false} {...field('url')} />
        <input aria-label={t('sources.username')} placeholder={t('sources.username')} autoComplete="off" {...field('username')} />
        <input type="password" aria-label={t('sources.password')} placeholder={t('sources.password')} autoComplete="off" {...field('password')} />
        <button type="submit" className={classNames(style.action, style.submit)} disabled={!valid || saving}>
          {t(saving ? 'sources.checking' : 'sources.save')}
        </button>
      </form>
      {insecure && <div className={style.warning}>{t('sources.insecure')}</div>}
      {failure && !failure.id && (
        <div className={style.error} role="alert">
          {t('sources.failed', { error: failure.error })}
        </div>
      )}
      {failure?.id && (
        <div className={style.error} role="alert">
          {failure.code === wrongLogin ? t('sources.wrongLogin') : t('sources.failed', { error: failure.error })}
        </div>
      )}
      {failure && !certificate && form.url.trim().toLowerCase().startsWith('https:') && (
        <button type="button" className={style.action} onClick={() => readCertificate(form.url.trim())}>
          {t('sources.readCertificate')}
        </button>
      )}
      {certificate && (
        <div role="group" aria-label={t('sources.certificate')}>
          <div className={style.warning}>{t('sources.certificateWarning', { url: certificate.url })}</div>
          <div className={style.code}>{certificate.code}</div>
          <div className={style.buttons}>
            <button type="button" className={style.action} disabled={!valid || saving} onClick={(event) => submit(event, certificate.certificate)}>
              {t('sources.approve')}
            </button>
            <button type="button" className={style.action} onClick={clearCertificate}>
              {t('sources.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface Position {
  artist?: { id: string; name: string };
  album?: { id: string; title: string };
  query?: string;
}

const requestOf = (serverId: string, { artist, album, query }: Position): SourceBrowse =>
  sourceBrowseSchema.parse(
    query
      ? { what: 'search', serverId, query }
      : album
        ? { what: 'tracks', serverId, id: album.id }
        : artist
          ? { what: 'albums', serverId, id: artist.id }
          : { what: 'artists', serverId }
  );

const Cover = ({ serverId, coverArt }: { serverId: string; coverArt: string | undefined }) =>
  coverArt ? (
    <img
      className={style.cover}
      alt=""
      loading="lazy"
      src={localUrl(`/source/cover?path=${encodeURIComponent(toSourcePath({ source: 'subsonic', serverId, id: coverArt }))}`)}
    />
  ) : (
    <span className={style.cover} />
  );

const Browser = ({ server, state, browse, play }: { server: SourceServerInfo } & Pick<SourceServersProps, 'state' | 'browse' | 'play'>) => {
  const { t } = useTranslation();
  const [position, setPosition] = useState<Position>({});
  const [text, setText] = useState('');
  const request = requestOf(server.id, position);
  const key = browseKey(request);
  const answer = state.browsed[key];

  useEffect(() => browse(request), [key]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setPosition({ query: text.trim() || undefined });
  };

  const artistRows = (artists: SourceArtist[]) =>
    artists.map((artist) => (
      <button key={artist.id} type="button" className={classNames(style.link, style.row)} onClick={() => setPosition({ artist })}>
        <span className={style.rowText}>{artist.name}</span>
        <span className={style.meta}>{t('sources.albums', { count: artist.albumCount })}</span>
      </button>
    ));

  const albumRows = (albums: SourceAlbum[]) =>
    albums.map((album) => (
      <button key={album.id} type="button" className={classNames(style.link, style.row)} onClick={() => setPosition({ artist: position.artist, album })}>
        <Cover serverId={server.id} coverArt={album.coverArt} />
        <span className={style.rowText}>{[album.title, album.artist].filter(Boolean).join(' · ')}</span>
        <span className={style.meta}>{[album.year, t('sources.songs', { count: album.songCount })].filter(Boolean).join(' · ')}</span>
      </button>
    ));

  const trackRows = (tracks: Track[]) =>
    tracks.map((track) => (
      <div key={track.path} className={style.row}>
        <button type="button" className={style.action} aria-label={`${t('player.play')}: ${track.title}`} onClick={() => play(tracks, track)}>
          <PlayIcon size="14px" />
        </button>
        <span className={style.rowText}>{[track.track, track.title, track.artist].filter(Boolean).join(' · ')}</span>
        <span className={style.meta}>{track.codec}</span>
      </div>
    ));

  const result = answer?.result;

  return (
    <div className={style.tile}>
      <div className={style.sectionTitle}>{server.name}</div>
      <form className={classNames(style.form, style.inline)} role="search" onSubmit={search}>
        <input
          type="search"
          aria-label={t('sources.search')}
          placeholder={t('sources.search')}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className={classNames(style.action, style.submit)}>
          {t('sources.search')}
        </button>
      </form>
      <nav className={style.crumbs} aria-label={t('sources.location')}>
        <button type="button" className={style.action} onClick={() => setPosition({})}>
          {t('sources.artists')}
        </button>
        {position.artist && (
          <button type="button" className={style.action} onClick={() => setPosition({ artist: position.artist })}>
            {position.artist.name}
          </button>
        )}
        {position.album && <span className={style.meta}>{position.album.title}</span>}
        {position.query && <span className={style.meta}>{t('sources.resultsFor', { query: position.query })}</span>}
      </nav>
      {!answer && (
        <div className={style.hint} role="status">
          {t('sources.loading')}
        </div>
      )}
      {answer?.error && (
        <div className={style.error} role="alert">
          {t('sources.failed', { error: answer.error })}
        </div>
      )}
      {isArtists(result) && artistRows(result)}
      {isAlbums(result) && albumRows(result)}
      {isTracks(result) && trackRows(result)}
      {isSearch(result) && (
        <>
          {artistRows(result.artists)}
          {albumRows(result.albums)}
          {trackRows(result.tracks)}
        </>
      )}
      {result && Array.isArray(result) && result.length === 0 && <div className={style.hint}>{t('sources.empty')}</div>}
    </div>
  );
};

const SourceServers = ({ state, load, save, remove, readCertificate, clearCertificate, browse, play }: SourceServersProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | undefined>(undefined);
  const opened = state.servers.find(({ id }) => id === open);

  useEffect(() => load(), []);

  return (
    <div className={style.sourceServers}>
      <div className={style.content}>
        <div className={style.tile}>
          <div className={style.sectionTitle}>{t('sources.title')}</div>
          {state.servers.length === 0 && <div className={style.hint}>{t('sources.none')}</div>}
          {state.servers.map((server) => (
            <div key={server.id} className={classNames(style.row, { [style.current]: server.id === open })}>
              <button type="button" className={classNames(style.link, style.rowText)} aria-pressed={server.id === open} onClick={() => setOpen(server.id)}>
                {server.name}
              </button>
              <span className={style.meta}>{server.url}</span>
              <button type="button" className={style.action} aria-label={t('sources.remove', { name: server.name })} onClick={() => remove(server.id)}>
                {t('sources.removeShort')}
              </button>
              {!server.protected && <div className={style.warning}>{t('sources.unprotected')}</div>}
            </div>
          ))}
        </div>
        {opened && <Browser key={opened.id} server={opened} state={state} browse={browse} play={play} />}
        <AddServer state={state} save={save} readCertificate={readCertificate} clearCertificate={clearCertificate} />
      </div>
    </div>
  );
};

export default SourceServers;
