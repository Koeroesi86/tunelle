import { useCallback, useEffect, useMemo } from 'react';
import type { Folder, Track } from '../../types/library';
import { cycleSort } from '../../types/library-query';
import type { TrackSort, TrackSortField } from '../../types/library-query';
import { useTranslation } from '../../client/i18n';
import { useScrollSeparator } from '../../client/hooks/use-scroll-separator';
import { usePageLoader } from '../../client/hooks/use-page-loader';
import { useWindowedList } from '../../client/hooks/use-windowed-list';
import { fetchLibrary } from '../../client/services/library-api';
import { selectedFolders } from '../../client/library-query';
import { getCachedItem } from '../../client/redux/library/pages';
import type { PageCache } from '../../client/redux/library/pages';
import { isOffline } from '../../client/offline-folders';
import style from './TrackView.scss';
import TrackViewItem from '../track-view-item';
import type { TrackLabels } from '../track-view-item/TrackViewItem';

/** The height of a row in px, matching .trackViewItem in TrackViewItem.scss */
const rowHeight = 28;

interface TrackViewProps {
  tracks: PageCache<Track>;
  currentSong: Track | null;
  offlineFolders: string[];
  /** The sort of the list, undefined is the default order */
  sort: TrackSort | undefined;
  /** The selected folders and the folders of the library, the selection can hold a folder the library no longer has */
  selected: string[];
  folders: Folder[];
  /** The text the tracks are searched for, undefined is no search */
  search: string | undefined;
  playTracks: (tracks: Track[]) => void;
  loadPage: (page: number) => void;
  setSort: (sort: TrackSort | undefined) => void;
  /** The selected tracks by their path */
  selectedTracks: Record<string, Track>;
  toggleTrack: (track: Track) => void;
  selectTracks: (tracks: Track[]) => void;
  clearSelection: () => void;
}

const TrackView = ({
  currentSong,
  playTracks,
  tracks,
  offlineFolders,
  sort,
  selected,
  folders,
  search,
  loadPage,
  setSort,
  selectedTracks,
  toggleTrack,
  selectTracks,
  clearSelection,
}: TrackViewProps) => {
  const { t } = useTranslation();
  const headerLabels = useMemo<TrackLabels>(
    () => ({
      duration: t('tracks.duration'),
      artist: t('tracks.artist'),
      year: t('tracks.year'),
      album: t('tracks.album'),
      track: '#',
      title: t('tracks.title'),
    }),
    [t]
  );
  const { separator, listing: scrolled } = useScrollSeparator(style.scrolled);
  const { listing, firstIndex, lastIndex, offsetTop, height } = useWindowedList({ itemCount: tracks.total ?? 0, rowHeight });
  const setListing = useCallback(
    (element: HTMLDivElement | null) => {
      listing.current = element;
      scrolled.current = element;
    },
    [listing, scrolled]
  );
  usePageLoader(tracks, firstIndex, lastIndex, loadPage);

  const folderSelection = selectedFolders(selected, folders);
  const query = { sort, folders: folderSelection, search };
  const queryKey = JSON.stringify(query);
  // another sort, other folders or another search are another list, which starts from its top
  useEffect(() => {
    if (listing.current) listing.current.scrollTop = 0;
  }, [listing, queryKey]);

  const selectedCount = Object.keys(selectedTracks).length;
  const sortBy = useCallback((field: TrackSortField) => setSort(cycleSort(sort, field)), [setSort, sort]);

  const doubleClickTrack = useCallback(
    (track: Track) => {
      playTracks([track]);
      selectTracks([track]);
    },
    [playTracks, selectTracks]
  );

  // the pages that are not fetched yet are not in the cache, the whole library is fetched for the selection
  const selectAll = () => fetchLibrary(query).then(selectTracks).catch(console.error);

  return (
    <div className={style.tracks}>
      <TrackViewItem track={headerLabels} isHeader sort={sort} onSort={sortBy} />
      <div ref={separator} className={style.separator} />
      {search && tracks.total === 0 && <div className={style.empty}>{t('library.noResults', { search })}</div>}
      <div className={style.listing} ref={setListing}>
        <div className={style.window} style={{ height, paddingTop: offsetTop }}>
          {Array.from({ length: lastIndex - firstIndex }, (_, offset) => {
            const track = getCachedItem(tracks, firstIndex + offset);
            return track ? (
              <TrackViewItem
                key={track.path}
                track={track}
                isSelected={Object.hasOwn(selectedTracks, track.path)}
                isCurrent={currentSong?.path === track.path}
                isOffline={isOffline(track.path, offlineFolders)}
                clickTrack={toggleTrack}
                doubleClickTrack={doubleClickTrack}
              />
            ) : (
              <div key={firstIndex + offset} className={style.placeholder} />
            );
          })}
        </div>
      </div>
      <div className={style.footer}>
        <span className={style.count}>{t('tracks.count', { count: tracks.total ?? 0 })}</span>
        <div className={style.controls}>
          <button disabled={selectedCount === 0} onClick={clearSelection}>
            {t('tracks.clearSelection')}
          </button>
          <button onClick={selectAll}>{t('tracks.selectAll')}</button>
          <button className={style.play} disabled={selectedCount === 0} onClick={() => playTracks(Object.values(selectedTracks))}>
            {t('tracks.playSelected')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrackView;
