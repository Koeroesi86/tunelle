import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import classNames from 'classnames';
import { MdPlayArrow as PlayIcon } from 'react-icons/md';
import type { Track } from '@shared/types/library';
import type { MessageKey } from '@shared/locales/translate';
import { sourceBrowseSchema, sourceCapabilities, toSourcePath } from '@shared/schemas/sources';
import type {
  LibraryKind,
  LibrarySort,
  SourceAlbum,
  SourceArtist,
  SourceBrowse,
  SourceKind,
  SourcePage,
  SourceSearchResult,
  SourceServerInfo,
} from '@shared/schemas/sources';
import type { SourcesState } from '../../../redux/sources/reducer';
import { browseKey } from '../../../redux/sources/reducer';
import { useTranslation } from '../../../i18n';
import { localUrl } from '../../../services/local-url';
import style from './SourceServers.scss';

interface SourceServersProps {
  /** The kind of server this page is for: each has its own page, as its own API */
  kind: SourceKind;
  /** The section of the libraries of the servers to show: without one the page is where the servers are added and removed */
  section?: LibraryKind;
  state: SourcesState;
  load: () => void;
  save: (server: Record<string, unknown>) => void;
  remove: (id: string) => void;
  discover: () => void;
  signInPlex: () => void;
  cancelPlexSignIn: () => void;
  addPlexServer: (id: string) => void;
  readCertificate: (url: string) => void;
  clearCertificate: () => void;
  browse: (request: SourceBrowse) => void;
  play: (tracks: Track[], track: Track) => void;
}

const words = {
  subsonic: { title: 'sources.title', hint: 'sources.addHint', example: 'Navidrome' },
  jellyfin: { title: 'sources.jellyfinTitle', hint: 'sources.jellyfinAddHint', example: 'Jellyfin' },
  plex: { title: 'sources.plexTitle', hint: 'sources.plexAddHint', example: 'Plex' },
} as const;

/** A Plex server is entered with its token: the login of the other kinds has no user name there, so the entry keeps a fixed one */
const plexUser = 'plex';

/** The wrong user or password, which the page words in its language */
const wrongLogin = 40;

const isArtists = (result: unknown): result is SourceArtist[] => Array.isArray(result) && result.every((item) => 'name' in item);
const isAlbums = (result: unknown): result is SourceAlbum[] => Array.isArray(result) && result.every((item) => 'id' in item && 'title' in item);
const isTracks = (result: unknown): result is Track[] => Array.isArray(result) && result.every((item) => 'path' in item);
const isObject = (result: unknown): result is object => typeof result === 'object' && result !== null && !Array.isArray(result);
const isSearch = (result: unknown): result is SourceSearchResult => isObject(result) && 'artists' in result;
const isPage = (result: unknown): result is SourcePage => isObject(result) && 'items' in result;

const PlexAccount = ({
  state,
  signInPlex,
  cancelPlexSignIn,
  addPlexServer,
}: Pick<SourceServersProps, 'state' | 'signInPlex' | 'cancelPlexSignIn' | 'addPlexServer'>) => {
  const { t } = useTranslation();
  const { plexAccount, saving } = state;

  return (
    <div className={style.discovery}>
      {plexAccount?.status !== 'waiting' && (
        <button type="button" className={style.action} onClick={signInPlex}>
          {t('sources.plexSignIn')}
        </button>
      )}
      {plexAccount?.status === 'waiting' && (
        <>
          <div className={style.hint} role="status">
            {t('sources.plexWaiting')}
          </div>
          <button type="button" className={style.action} onClick={cancelPlexSignIn}>
            {t('sources.cancel')}
          </button>
        </>
      )}
      {plexAccount?.status === 'failed' && (
        <div className={style.error} role="alert">
          {t('sources.failed', { error: plexAccount.error ?? '' })}
        </div>
      )}
      {plexAccount?.status === 'servers' && plexAccount.servers?.length === 0 && <div className={style.hint}>{t('sources.plexNoServers')}</div>}
      {plexAccount?.servers?.map(({ id, name }) => (
        <div key={id} className={style.server}>
          <span className={style.name}>{name}</span>
          <button type="button" className={style.action} disabled={saving} aria-label={t('sources.plexAdd', { name })} onClick={() => addPlexServer(id)}>
            {t(saving ? 'sources.checking' : 'sources.useShort')}
          </button>
        </div>
      ))}
    </div>
  );
};

const AddServer = ({
  kind,
  state,
  save,
  discover,
  signInPlex,
  cancelPlexSignIn,
  addPlexServer,
  readCertificate,
  clearCertificate,
  onClose,
}: Pick<
  SourceServersProps,
  'kind' | 'state' | 'save' | 'discover' | 'signInPlex' | 'cancelPlexSignIn' | 'addPlexServer' | 'readCertificate' | 'clearCertificate'
> & {
  onClose?: () => void;
}) => {
  const { t } = useTranslation();
  const { saving, failure, certificate, discovery } = state;
  const offered = (discovery?.servers ?? []).filter(({ url }) => !state.servers.some((server) => server.url === url));
  const [form, setForm] = useState({ name: '', url: '', username: kind === 'plex' ? plexUser : '', password: '' });
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
      {kind === 'plex' && <PlexAccount state={state} signInPlex={signInPlex} cancelPlexSignIn={cancelPlexSignIn} addPlexServer={addPlexServer} />}
      <form className={style.form} onSubmit={(event) => submit(event, certificate?.certificate)}>
        <label className={style.field}>
          <span>{t('sources.name')}</span>
          <input autoComplete="off" placeholder={words[kind].example} {...field('name')} />
        </label>
        <label className={style.field}>
          <span>{t('sources.url')}</span>
          <input autoComplete="off" spellCheck={false} placeholder="https://music.example.com" {...field('url')} />
        </label>
        {kind !== 'plex' && (
          <label className={style.field}>
            <span>{t('sources.username')}</span>
            <input autoComplete="off" {...field('username')} />
          </label>
        )}
        <label className={style.field}>
          <span>{t(kind === 'plex' ? 'sources.token' : 'sources.password')}</span>
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

interface LibraryView {
  kind: LibraryKind;
  sort: LibrarySort;
  pages: number;
}

const pageSize = 60;
const sortLabels: Record<LibrarySort, MessageKey> = { recent: 'sources.sortRecent', title: 'sources.sortTitle' };

const libraryRequest = (serverId: string, { kind, sort }: LibraryView, page: number): SourceBrowse =>
  sourceBrowseSchema.parse({ what: 'library', serverId, kind, sort, start: page * pageSize, size: pageSize });

const Cover = ({ kind, serverId, coverArt, large }: { kind: SourceKind; serverId: string; coverArt: string | undefined; large?: boolean }) =>
  coverArt ? (
    <img
      className={large ? style.cardCover : style.cover}
      alt=""
      loading="lazy"
      src={localUrl(`/source/cover?path=${encodeURIComponent(toSourcePath({ source: kind, serverId, id: coverArt }))}`)}
    />
  ) : (
    <span className={large ? style.cardCover : style.cover} />
  );

const Browser = ({
  server,
  section,
  named,
  state,
  browse,
  play,
}: { server: SourceServerInfo; section: LibraryKind; named: boolean } & Pick<SourceServersProps, 'state' | 'browse' | 'play'>) => {
  const { t } = useTranslation();
  const [position, setPosition] = useState<Position>({});
  const [text, setText] = useState('');
  const { library } = sourceCapabilities[server.kind];
  const [view, setView] = useState<LibraryView>({ kind: section, sort: library?.sorts.at(0) ?? 'recent', pages: 1 });
  // a server with a library lists it in pages at the top, with the sections and orders it has; the others start at their artists
  const inLibrary = library?.sections.includes(section) === true && !position.artist && !position.album && !position.query;
  const request = inLibrary ? libraryRequest(server.id, view, view.pages - 1) : requestOf(server.id, position);
  const key = browseKey(request);
  const answers = Array.from(
    { length: inLibrary ? view.pages : 1 },
    (_, page) => state.browsed[inLibrary ? browseKey(libraryRequest(server.id, view, page)) : key]
  );
  const answer = answers.at(-1);
  const loaded = answers.map((entry) => entry?.result).filter(isPage);

  useEffect(() => {
    browse(request);
  }, [key]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setPosition({ query: text.trim() || undefined });
  };

  const artistRows = (artists: SourceArtist[]) =>
    artists.map((artist) => (
      <button key={artist.id} type="button" className={classNames(style.link, style.row)} onClick={() => setPosition({ artist })}>
        <span className={style.rowText}>{artist.name}</span>
        {artist.albumCount !== undefined && <span className={style.meta}>{t('sources.albums', { count: artist.albumCount })}</span>}
      </button>
    ));

  const albumRows = (albums: SourceAlbum[]) =>
    albums.map((album) => (
      <button key={album.id} type="button" className={classNames(style.link, style.row)} onClick={() => setPosition({ artist: position.artist, album })}>
        <Cover kind={server.kind} serverId={server.id} coverArt={album.coverArt} />
        <span className={style.rowText}>{[album.title, album.artist].filter(Boolean).join(' · ')}</span>
        <span className={style.meta}>
          {[album.year, album.songCount !== undefined && t('sources.songs', { count: album.songCount })].filter(Boolean).join(' · ')}
        </span>
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

  const albumCards = (albums: SourceAlbum[]) =>
    albums.map((album) => (
      <button key={album.id} type="button" className={classNames(style.link, style.card)} onClick={() => setPosition({ album })}>
        <Cover kind={server.kind} serverId={server.id} coverArt={album.coverArt} large />
        <span className={style.cardText}>{album.title}</span>
        <span className={style.meta}>{[album.artist, album.year].filter(Boolean).join(' · ')}</span>
      </button>
    ));

  const artistCards = (artists: SourceArtist[]) =>
    artists.map((artist) => (
      <button key={artist.id} type="button" className={classNames(style.link, style.card)} onClick={() => setPosition({ artist })}>
        <Cover kind={server.kind} serverId={server.id} coverArt={artist.coverArt} large />
        <span className={style.cardText}>{artist.name}</span>
      </button>
    ));

  const items = loaded.flatMap<unknown>((page) => page.items);
  const total = loaded.at(0)?.total;
  const result: unknown = inLibrary ? (loaded.length ? items : undefined) : answer?.result;
  // a server that tells no total has more while its last page is full
  const hasMore = inLibrary && loaded.length === view.pages && (total === undefined ? (loaded.at(-1)?.items.length ?? 0) >= pageSize : items.length < total);

  return (
    <div className={style.tile}>
      {named && (
        <div className={style.serverName}>
          <span className={style.sectionTitle}>{server.name}</span>
          <span className={style.meta}>{server.url}</span>
        </div>
      )}
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
          {t(library ? 'sources.library' : 'sources.artists')}
        </button>
        {position.artist && (
          <button type="button" className={style.action} onClick={() => setPosition({ artist: position.artist })}>
            {position.artist.name}
          </button>
        )}
        {position.album && <span className={style.meta}>{position.album.title}</span>}
        {position.query && <span className={style.meta}>{t('sources.resultsFor', { query: position.query })}</span>}
      </nav>
      {inLibrary && (
        <div className={style.libraryBar}>
          {(library?.sorts.length ?? 0) > 1 && (
            <label className={style.sort}>
              <span className={style.meta}>{t('sources.sort')}</span>
              <select
                value={view.sort}
                onChange={(event) => setView({ ...view, sort: library?.sorts.find((sort) => sort === event.target.value) ?? view.sort, pages: 1 })}
              >
                {library?.sorts.map((sort) => (
                  <option key={sort} value={sort}>
                    {t(sortLabels[sort])}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
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
      {inLibrary && isAlbums(result) && result.length > 0 && <div className={style.grid}>{albumCards(result)}</div>}
      {inLibrary && isArtists(result) && view.kind === 'artists' && result.length > 0 && <div className={style.grid}>{artistCards(result)}</div>}
      {!inLibrary && isArtists(result) && artistRows(result)}
      {!inLibrary && isAlbums(result) && albumRows(result)}
      {isTracks(result) && trackRows(result)}
      {isSearch(result) && (
        <>
          {artistRows(result.artists)}
          {albumRows(result.albums)}
          {trackRows(result.tracks)}
        </>
      )}
      {hasMore && (
        <div className={style.buttons}>
          <button type="button" className={style.action} onClick={() => setView({ ...view, pages: view.pages + 1 })}>
            {t('sources.showMore')}
          </button>
          {total !== undefined && <span className={style.meta}>{t('sources.shown', { shown: items.length, total })}</span>}
        </div>
      )}
      {Array.isArray(result) && result.length === 0 && <div className={style.hint}>{t('sources.empty')}</div>}
    </div>
  );
};

const SourceServers = ({
  kind,
  section,
  state,
  load,
  save,
  remove,
  discover,
  signInPlex,
  cancelPlexSignIn,
  addPlexServer,
  readCertificate,
  clearCertificate,
  browse,
  play,
}: SourceServersProps) => {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const servers = state.servers.filter((server) => server.kind === kind);

  useEffect(() => {
    load();
  }, []);

  // a server that was kept closes the form
  useEffect(() => {
    setAdding(false);
  }, [servers.length]);

  if (section)
    return (
      <div className={style.sourceServers}>
        <div className={style.content}>
          {servers.length === 0 && <div className={style.hint}>{t('sources.none')}</div>}
          {servers.map((server) => (
            <Browser key={server.id} server={server} section={section} named={servers.length > 1} state={state} browse={browse} play={play} />
          ))}
        </div>
      </div>
    );

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
            <div key={server.id} className={style.server}>
              <div className={style.serverName}>
                <span className={style.name}>{server.name}</span>
                <span className={style.meta}>{server.url}</span>
              </div>
              <div className={style.buttons}>
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
            signInPlex={signInPlex}
            cancelPlexSignIn={cancelPlexSignIn}
            addPlexServer={addPlexServer}
            readCertificate={readCertificate}
            clearCertificate={clearCertificate}
            onClose={servers.length > 0 ? () => setAdding(false) : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default SourceServers;
