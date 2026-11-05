import { useCallback, useEffect, useState } from 'react';
import classNames from 'classnames';
import { FaChevronLeft } from 'react-icons/fa';
import { MdPlayArrow as PlayIcon, MdShuffle as ShuffleIcon } from 'react-icons/md';
import type { Folder, GroupSummary, Track } from '@shared/types/library';
import type { GroupKind, GroupSort } from '@shared/types/library-query';
import { useTranslation } from '../../i18n';
import { usePageLoader } from '../../hooks/use-page-loader';
import { useScrollSeparator } from '../../hooks/use-scroll-separator';
import { useWindowedList } from '../../hooks/use-windowed-list';
import { fetchGroupTracks } from '../../utils/group-tracks';
import { selectedFolders } from '../../utils/library-query';
import { shuffled } from '../../utils/shuffled';
import { getCachedItem } from '../../redux/library/pages';
import type { PageCache } from '../../redux/library/pages';
import type { OpenGroup } from '../../redux/types';
import AlbumSort from '../album-sort';
import CoverSizeSlider from '../cover-size-slider';
import GenreCard from '../genre-card';
import GroupAlbums from '../group-albums';
import GroupTile from '../group-tile';
import style from './GroupView.scss';

/** The gap between two tiles in px, the tiles grow to fill the width; matching .tileRow in GroupView.scss */
const tileGap = 18;
/** The space under a tile and the height of its two lines of text in px, matching .groupTile in GroupTile.scss */
const tileRowGap = 18;
const tileTextHeight = 46;
/** A row is a square photo and the text under it */
const tileRowHeightOf = (tileWidth: number) => tileWidth + tileTextHeight + tileRowGap;

/** The cards of the genres: their least width, the gap and the height in px, matching .cardRow in GroupView.scss and $height in GenreCard.scss */
const cardWidth = 210;
const cardGap = 14;
const cardHeight = 112;

interface GroupViewProps {
  kind: GroupKind;
  groups: PageCache<GroupSummary>;
  /** The sort and the filter of the list (set in the header), undefined is the default order and an empty text is all of the names */
  sort: GroupSort | undefined;
  filter: string;
  /** The least width of a tile in px, which the slider below the tiles sets */
  coverSize: number;
  /** The selected folders and the folders of the library, the selection can hold a folder the library no longer has */
  selected: string[];
  folders: Folder[];
  /** The group whose albums are shown instead of the list */
  open: OpenGroup | undefined;
  loadPage: (page: number) => void;
  playTracks: (tracks: Track[]) => void;
  setCoverSize: (size: number) => void;
  openGroup: (group: OpenGroup) => void;
  closeGroup: () => void;
}

/** The list of the groups; it is its own component as its scroll and size listeners belong to the element, which is new each time the list comes back */
const GroupList = ({
  kind,
  groups,
  sort,
  filter,
  coverSize,
  selected,
  folders,
  loadPage,
  setCoverSize,
  openGroup,
}: Omit<GroupViewProps, 'open' | 'closeGroup' | 'playTracks'>) => {
  const { t } = useTranslation();
  const { separator, listing: scrolled } = useScrollSeparator(style.scrolled);
  // the artists and the album artists are photo tiles of the size of the slider, the genres are cards of one size
  const cards = kind === 'genre';
  const { listing, columns, rowHeight, firstIndex, lastIndex, offsetTop, height } = useWindowedList({
    itemCount: groups.total ?? 0,
    rowHeight: cards ? cardHeight + cardGap : tileRowHeightOf,
    itemWidth: cards ? cardWidth : coverSize,
    gap: cards ? cardGap : tileGap,
  });
  usePageLoader(groups, firstIndex, lastIndex, loadPage);

  const queryKey = JSON.stringify([sort, filter, selectedFolders(selected, folders)]);
  // another sort, filter or other folders are another list, which starts from its top
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

  const nameOf = (name: string) => name || t(`groups.unknown.${kind}`);
  const openOne = (group: GroupSummary) => openGroup({ kind, key: group.key, name: group.name });
  const rows = Array.from({ length: Math.ceil((lastIndex - firstIndex) / columns) }, (_, row) =>
    Array.from({ length: Math.min(columns, lastIndex - firstIndex - row * columns) }, (__, column) => firstIndex + row * columns + column)
  );

  const rowStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, height: rowHeight };
  const tiles = rows.map((indexes) => (
    <div key={indexes[0]} className={classNames(style.tileRow, { [style.cardRow]: cards })} style={rowStyle}>
      {indexes.map((index) => {
        const group = getCachedItem(groups, index);
        if (!group) return <div key={index} className={cards ? style.cardPlaceholder : style.tilePlaceholder} />;
        return cards ? (
          <GenreCard key={group.key} group={group} unknownName={nameOf('')} open={openOne} />
        ) : (
          <GroupTile key={group.key} group={group} unknownName={nameOf('')} open={openOne} />
        );
      })}
    </div>
  ));

  return (
    <div className={style.groups}>
      <div ref={separator} className={style.separator} />
      <div className={style.listing} ref={setListing}>
        <div className={style.window} style={{ height, paddingTop: offsetTop }}>
          {tiles}
        </div>
      </div>
      <div className={style.footer}>
        <span>{t(`groups.count.${kind}`, { count: groups.total ?? 0 })}</span>
        {!cards && <CoverSizeSlider size={coverSize} setSize={setCoverSize} />}
      </div>
    </div>
  );
};

const GroupView = ({ open, closeGroup, playTracks, ...list }: GroupViewProps) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const openName = open && (open.name || t(`groups.unknown.${open.kind}`));

  // the albums of the group are fetched for the queue, which can take a moment for a big group
  const play = (shuffle: boolean) => {
    if (!open) return;

    setBusy(true);
    fetchGroupTracks(open, selectedFolders(list.selected, list.folders))
      .then((tracks) => playTracks(shuffle ? shuffled(tracks) : tracks))
      .catch(console.error)
      .finally(() => setBusy(false));
  };

  return open ? (
    <GroupAlbums
      toolbar={
        <div className={style.albumsBar}>
          <button type="button" className={style.back} onClick={closeGroup} aria-label={t('groups.back')} title={t('groups.back')}>
            <FaChevronLeft aria-hidden />
          </button>
          <span className={style.openName} title={openName}>
            {openName}
          </span>
          <button type="button" className={classNames(style.action, style.primary)} disabled={busy} onClick={() => play(false)}>
            <PlayIcon size="14px" aria-hidden />
            {t('playlists.playAll')}
          </button>
          <button type="button" className={style.action} disabled={busy} onClick={() => play(true)}>
            <ShuffleIcon size="14px" aria-hidden />
            {t('favourites.shuffle')}
          </button>
          <AlbumSort />
        </div>
      }
    />
  ) : (
    <GroupList {...list} />
  );
};

export default GroupView;
