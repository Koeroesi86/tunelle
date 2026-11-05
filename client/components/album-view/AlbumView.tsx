import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import classNames from 'classnames';
import type { Album, AlbumSummary, Folder, Track } from '@shared/types/library';
import type { AlbumSort as AlbumSortValue } from '@shared/types/library-query';
import { useTranslation } from '../../i18n';
import { useScrollSeparator } from '../../hooks/use-scroll-separator';
import { usePageLoader } from '../../hooks/use-page-loader';
import { useWindowedList } from '../../hooks/use-windowed-list';
import { fetchAlbum } from '../../services/library-api';
import { getCachedItem } from '../../redux/library/pages';
import type { PageCache } from '../../redux/library/pages';
import style from './AlbumView.scss';
import AlbumViewThumbnail from '../album-view-thumbnail';
import CoverSizeSlider from '../cover-size-slider';
import { selectedFolders } from '../../utils/library-query';

/** The gap between two covers in px, the covers grow to fill the width; matching .row in AlbumView.scss */
const columnGap = 18;
/** The space under a thumbnail and the height of its lines of text in px, matching .albumViewThumbnail in AlbumViewThumbnail.scss */
const rowGap = 22;
const textHeight = 66;
/** A row is a square cover and the text under it */
const rowHeightOf = (coverWidth: number) => coverWidth + textHeight + rowGap;

interface AlbumViewProps {
  albums: PageCache<AlbumSummary>;
  /** The sort of the list and the folders it is limited to, the selection can hold a folder the library no longer has */
  sort: AlbumSortValue | undefined;
  selected: string[];
  folders: Folder[];
  /** The text the albums are searched for, undefined is no search */
  search: string | undefined;
  playTracks: (tracks: Track[]) => void;
  selectAlbum: (album: Album | null) => void;
  loadPage: (page: number) => void;
  /** The least width of a cover in px, which the slider of the bar below the list sets */
  coverSize: number;
  setCoverSize: (size: number) => void;
  /** What the bar above the list holds, no bar when omitted (the sort of the albums is in the header of the library) */
  toolbar?: ReactNode;
}

const AlbumView = ({ playTracks, selectAlbum, albums, sort, selected, folders, search, coverSize, setCoverSize, loadPage, toolbar }: AlbumViewProps) => {
  const { t } = useTranslation();
  const { separator, listing: scrolled } = useScrollSeparator(style.scrolled);
  const { listing, columns, rowHeight, firstIndex, lastIndex, offsetTop, height } = useWindowedList({
    itemCount: albums.total ?? 0,
    rowHeight: rowHeightOf,
    itemWidth: coverSize,
    gap: columnGap,
  });
  usePageLoader(albums, firstIndex, lastIndex, loadPage);

  const queryKey = JSON.stringify([sort, selectedFolders(selected, folders), search]);
  // another sort, other folders or another search are another list, which starts from its top
  useEffect(() => {
    if (listing.current) listing.current.scrollTop = 0;
  }, [listing, queryKey]);

  const setListing = useCallback(
    (element: HTMLDivElement | null) => {
      listing.current = element;
      scrolled.current = element;
    },
    [listing, scrolled]
  );

  // the tracks of an album are fetched when it is opened or played, the listing has the albums only
  const openAlbum = useCallback((album: AlbumSummary) => fetchAlbum(album).then(selectAlbum).catch(console.error), [selectAlbum]);
  const playAlbum = useCallback(
    (album: AlbumSummary) =>
      fetchAlbum(album)
        .then(({ tracks }) => playTracks(tracks))
        .catch(console.error),
    [playTracks]
  );

  const rows = Array.from({ length: Math.ceil((lastIndex - firstIndex) / columns) }, (_, row) =>
    Array.from({ length: Math.min(columns, lastIndex - firstIndex - row * columns) }, (__, column) => firstIndex + row * columns + column)
  );

  return (
    <div className={classNames(style.albums, { [style.withToolbar]: toolbar })}>
      {toolbar && <div className={style.toolbar}>{toolbar}</div>}
      <div ref={separator} className={style.separator} />
      {search && albums.total === 0 && <div className={style.empty}>{t('library.noResults', { search })}</div>}
      <div className={style.listing} ref={setListing}>
        <div className={style.window} style={{ height, paddingTop: offsetTop }}>
          {rows.map((indexes) => (
            <div key={indexes[0]} className={style.row} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, height: rowHeight }}>
              {indexes.map((index) => {
                const album = getCachedItem(albums, index);
                return album ? (
                  <AlbumViewThumbnail key={album.id} album={album} selectAlbum={openAlbum} playAlbum={playAlbum} />
                ) : (
                  <div key={index} className={style.placeholder} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className={style.footer}>
        <span>{t('albums.count', { count: albums.total ?? 0 })}</span>
        <CoverSizeSlider size={coverSize} setSize={setCoverSize} />
      </div>
    </div>
  );
};

export default AlbumView;
