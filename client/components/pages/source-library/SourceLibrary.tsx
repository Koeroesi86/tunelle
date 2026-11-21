import { useEffect, useState } from 'react';
import { FaChevronLeft } from 'react-icons/fa';
import type { AlbumSummary } from '@shared/types/library';
import { sourceBrowseSchema, sourceCapabilities } from '@shared/schemas/sources';
import type { LibraryKind, LibrarySort, SourceBrowse, SourceKind, SourceServerInfo } from '@shared/schemas/sources';
import { useTranslation } from '../../../i18n';
import type { SourcesState } from '../../../redux/sources/reducer';
import { browseKey } from '../../../redux/sources/reducer';
import { pageRequest } from '../../../redux/sources/lists';
import SourceAlbums from '../../../containers/library/source-albums';
import SourceArtists from '../../../containers/library/source-artists';
import SourceTracks from '../../../containers/library/source-tracks';
import LibrarySearch from '../../library/library-search/LibrarySearch';
import SortSelect from '../../ui/sort-select/SortSelect';
import style from './SourceLibrary.scss';

interface SourceLibraryProps {
  kind: SourceKind;
  section: LibraryKind;
  servers: SourceServerInfo[];
  /** What the servers answered to the requests, by the key of the request */
  browsed: SourcesState['browsed'];
  load: () => void;
}

interface Position {
  artist?: { id: string; name: string };
  album?: { id: string; title: string };
}

const titleField = ['title'] as const;

/** The request of the list that is shown: where the person is wins over the search, which wins over the section */
const requestOf = (serverId: string, section: LibraryKind, sort: LibrarySort, query: string, { artist, album }: Position, inLibrary: boolean): SourceBrowse =>
  sourceBrowseSchema.parse(
    album
      ? { what: 'tracks', serverId, id: album.id }
      : artist
        ? { what: 'albums', serverId, id: artist.id }
        : query
          ? { what: 'search', serverId, query }
          : inLibrary
            ? { what: 'library', serverId, kind: section, sort, start: 0, size: 1 }
            : { what: 'artists', serverId }
  );

const SourceLibrary = ({ kind, section, servers, browsed, load }: SourceLibraryProps) => {
  const { t } = useTranslation();
  const [serverId, setServerId] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<Position>({});
  const { library } = sourceCapabilities[kind];
  const server = servers.find((known) => known.id === serverId) ?? servers.at(0);

  useEffect(() => {
    load();
  }, []);

  if (!server) return <div className={style.hint}>{t('sources.none')}</div>;

  const inLibrary = library?.sections.includes(section) === true;
  const request = requestOf(server.id, section, sort, query.trim(), position, inLibrary);
  const error = browsed[browseKey(pageRequest(request, 0))]?.error;
  const back = position.album ? () => setPosition({ artist: position.artist }) : () => setPosition({});
  const title = position.album?.title ?? position.artist?.name;
  const open = (album: AlbumSummary) => setPosition({ ...position, album: { id: album.id, title: album.title } });
  const openArtist = (artist: { id: string; name: string }) => setPosition({ artist });
  const search = (text: string) => {
    setPosition({});
    setQuery(text);
  };

  // the tracks of an album and the albums of an artist replace the section; a server without the section lists its artists
  const kindShown = position.album ? 'tracks' : position.artist ? 'albums' : query.trim() || inLibrary ? section : 'artists';

  const toolbar = (
    <div className={style.toolbar}>
      {servers.length > 1 && (
        <select
          className={style.server}
          aria-label={t('sources.server')}
          value={server.id}
          onChange={(event) => {
            setServerId(event.target.value);
            setPosition({});
          }}
        >
          {servers.map((known) => (
            <option key={known.id} value={known.id}>
              {known.name}
            </option>
          ))}
        </select>
      )}
      {title ? (
        <>
          <button type="button" className={style.back} onClick={back} aria-label={t('groups.back')} title={t('groups.back')}>
            <FaChevronLeft aria-hidden />
          </button>
          <span className={style.title} title={title}>
            {title}
          </span>
        </>
      ) : (
        <LibrarySearch search={query} setSearch={search} />
      )}
      {!title && !query.trim() && inLibrary && (library?.sorts.length ?? 0) > 1 && (
        <SortSelect
          fields={titleField}
          directional={false}
          labels={{
            prefix: t('library.sort'),
            field: t('sources.sort'),
            direction: t('sources.sort'),
            default: t('sources.sortRecent'),
            fields: { title: t('sources.sortTitle') },
            directions: { asc: '', desc: '' },
          }}
          sort={sort === 'title' ? { field: 'title', direction: 'asc' } : undefined}
          setSort={(next) => setSort(next ? 'title' : 'recent')}
        />
      )}
    </div>
  );

  return (
    <div className={style.sourceLibrary}>
      {toolbar}
      {error && (
        <div className={style.error} role="alert">
          {t('sources.failed', { error })}
        </div>
      )}
      <div className={style.view}>
        {kindShown === 'albums' && <SourceAlbums key={browseKey(request)} request={request} open={open} />}
        {kindShown === 'artists' && <SourceArtists key={browseKey(request)} request={request} open={openArtist} />}
        {kindShown === 'tracks' && (
          <SourceTracks
            key={browseKey(request)}
            request={request}
            setTitleOrder={request.what === 'library' ? (byTitle) => setSort(byTitle ? 'title' : 'recent') : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default SourceLibrary;
