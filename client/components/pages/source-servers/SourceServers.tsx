import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import classNames from 'classnames';
import { MdPlayArrow as PlayIcon } from 'react-icons/md';
import type { Track } from '@shared/types/library';
import { sourceBrowseSchema, toSourcePath } from '@shared/schemas/sources';
import type { SourceAlbum, SourceArtist, SourceBrowse, SourceBrowseResult, SourceKind, SourceSearchResult, SourceServerInfo } from '@shared/schemas/sources';
import type { SourcesState } from '../../../redux/sources/reducer';
import { browseKey } from '../../../redux/sources/reducer';
import { useTranslation } from '../../../i18n';
import { localUrl } from '../../../services/local-url';
import style from './SourceServers.scss';

interface SourceServersProps {
  /** The kind of server this page is for: each has its own page, as its own API */
  kind: SourceKind;
  state: SourcesState;
  load: () => void;
  save: (server: Record<string, unknown>) => void;
  remove: (id: string) => void;
  discover: () => void;
  readCertificate: (url: string) => void;
  clearCertificate: () => void;
  browse: (request: SourceBrowse) => void;
  play: (tracks: Track[], track: Track) => void;
}

const words = {
  subsonic: { title: 'sources.title', hint: 'sources.addHint', example: 'Navidrome' },
  jellyfin: { title: 'sources.jellyfinTitle', hint: 'sources.jellyfinAddHint', example: 'Jellyfin' },
} as const;

/** The wrong user or password, which the page words in its language */
const wrongLogin = 40;

const isArtists = (result: SourceBrowseResult | undefined): result is SourceArtist[] => Array.isArray(result) && result.every((item) => 'albumCount' in item);
const isAlbums = (result: SourceBrowseResult | undefined): result is SourceAlbum[] => Array.isArray(result) && result.every((item) => 'songCount' in item);
const isTracks = (result: SourceBrowseResult | undefined): result is Track[] => Array.isArray(result) && result.every((item) => 'path' in item);
const isSearch = (result: SourceBrowseResult | undefined): result is SourceSearchResult => result !== undefined && !Array.isArray(result);

const AddServer = ({
  kind,
  state,
  save,
  discover,
  readCertificate,
  clearCertificate,
  onClose,
}: Pick<SourceServersProps, 'kind' | 'state' | 'save' | 'discover' | 'readCertificate' | 'clearCertificate'> & { onClose?: () => void }) => {
  const { t } = useTranslation();
  const { saving, failure, certificate, discovery } = state;
  const offered = (discovery?.servers ?? []).filter(({ url }) => !state.servers.some((server) => server.url === url));
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '' });
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value }),
  });
  const valid = Object.values(form).every((value) => value.trim() !== '');
  const insecure = form.url.trim().toLowerCase().startsWith('http:');

  const submit = (event: FormEvent, approved?: string) => {
    event.preventDefault();
    if (valid && !saving) save({ id: crypto.randomUUID(), kind, ...form, certificate: approved });
  };

  return (
    <div className={style.tile}>
      <div className={style.sectionTitle}>{t('sources.add')}</div>
      <div className={style.hint}>{t(words[kind].hint)}</div>
      {kind === 'jellyfin' && (
        <div className={style.discovery}>
          <button type="button" className={style.action} disabled={discovery?.searching} onClick={discover}>
            {t(discovery?.searching ? 'sources.searching' : 'sources.discover')}
          </button>
          {discovery?.error && (
            <div className={style.error} role="alert">
              {t('sources.failed', { error: discovery.error })}
            </div>
          )}
          {discovery && !discovery.searching && !discovery.error && offered.length === 0 && <div className={style.hint}>{t('sources.noneFound')}</div>}
          {offered.map(({ id, name, url }) => (
            <div key={id} className={style.server}>
              <span className={style.name}>{name}</span>
              <span className={style.meta}>{url}</span>
              <button type="button" className={style.action} aria-label={t('sources.use', { name })} onClick={() => setForm({ ...form, name, url })}>
                {t('sources.useShort')}
              </button>
            </div>
          ))}
        </div>
      )}
      <form className={style.form} onSubmit={(event) => submit(event, certificate?.certificate)}>
        <label className={style.field}>
          <span>{t('sources.name')}</span>
          <input autoComplete="off" placeholder={words[kind].example} {...field('name')} />
        </label>
        <label className={style.field}>
          <span>{t('sources.url')}</span>
          <input autoComplete="off" spellCheck={false} placeholder="https://music.example.com" {...field('url')} />
        </label>
        <label className={style.field}>
          <span>{t('sources.username')}</span>
          <input autoComplete="off" {...field('username')} />
        </label>
        <label className={style.field}>
          <span>{t('sources.password')}</span>
          <input type="password" autoComplete="off" {...field('password')} />
        </label>
        <div className={classNames(style.buttons, style.submit)}>
          <button type="submit" className={classNames(style.action, style.primary)} disabled={!valid || saving}>
            {t(saving ? 'sources.checking' : 'sources.save')}
          </button>
          {onClose && (
            <button type="button" className={style.action} onClick={onClose}>
              {t('sources.cancel')}
            </button>
          )}
        </div>
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

const SourceServers = ({ kind, state, load, save, remove, discover, readCertificate, clearCertificate, browse, play }: SourceServersProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const servers = state.servers.filter((server) => server.kind === kind);
  const opened = servers.find(({ id }) => id === open);

  useEffect(() => load(), []);

  // a server that was kept closes the form
  useEffect(() => setAdding(false), [servers.length]);

  return (
    <div className={style.sourceServers}>
      <div className={style.content}>
        <div className={style.tile}>
          <div className={style.header}>
            <div className={style.sectionTitle}>{t(words[kind].title)}</div>
            {servers.length > 0 && !adding && (
              <button type="button" className={style.action} onClick={() => setAdding(true)}>
                {t('sources.add')}
              </button>
            )}
          </div>
          {servers.length === 0 && <div className={style.hint}>{t('sources.none')}</div>}
          {servers.map((server) => (
            <div key={server.id} className={classNames(style.server, { [style.current]: server.id === open })}>
              <div className={style.serverName}>
                <span className={style.name}>{server.name}</span>
                <span className={style.meta}>{server.url}</span>
              </div>
              <div className={style.buttons}>
                <button
                  type="button"
                  className={style.action}
                  aria-label={t('sources.browse', { name: server.name })}
                  aria-pressed={server.id === open}
                  onClick={() => setOpen(server.id === open ? undefined : server.id)}
                >
                  {t('sources.browseShort')}
                </button>
                <button type="button" className={style.action} aria-label={t('sources.remove', { name: server.name })} onClick={() => remove(server.id)}>
                  {t('sources.removeShort')}
                </button>
              </div>
              {!server.protected && <div className={style.warning}>{t('sources.unprotected')}</div>}
            </div>
          ))}
        </div>
        {(adding || servers.length === 0) && (
          <AddServer
            kind={kind}
            state={state}
            save={save}
            discover={discover}
            readCertificate={readCertificate}
            clearCertificate={clearCertificate}
            onClose={servers.length > 0 ? () => setAdding(false) : undefined}
          />
        )}
        {opened && <Browser key={opened.id} server={opened} state={state} browse={browse} play={play} />}
      </div>
    </div>
  );
};

export default SourceServers;
