import { albumSortFields } from '@shared/types/library-query';
import type { AlbumSort as AlbumSortValue } from '@shared/types/library-query';
import { useTranslation } from '../../i18n';
import SortSelect from '../sort-select/SortSelect';

interface AlbumSortProps {
  /** The sort of the albums, undefined is the default order */
  sort: AlbumSortValue | undefined;
  setSort: (sort: AlbumSortValue | undefined) => void;
}

const AlbumSort = ({ sort, setSort }: AlbumSortProps) => {
  const { t } = useTranslation();

  return (
    <SortSelect
      fields={albumSortFields}
      labels={{
        prefix: t('library.sort'),
        field: t('albums.sortField'),
        direction: t('albums.sortDirection'),
        default: t('albums.sort.default'),
        fields: {
          title: t('albums.sort.title'),
          artist: t('albums.sort.artist'),
          year: t('albums.sort.year'),
          trackCount: t('albums.sort.trackCount'),
          duration: t('albums.sort.duration'),
        },
        directions: { asc: t('albums.sort.asc'), desc: t('albums.sort.desc') },
      }}
      sort={sort}
      setSort={setSort}
    />
  );
};

export default AlbumSort;
