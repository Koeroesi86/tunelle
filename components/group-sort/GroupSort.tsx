import { groupSortFields } from '@shared/types/library-query';
import type { GroupSort as GroupSortValue } from '@shared/types/library-query';
import { useTranslation } from '../../client/i18n';
import SortSelect from '../sort-select/SortSelect';

interface GroupSortProps {
  /** The sort of the artists, album artists and genres, undefined is the default order */
  sort: GroupSortValue | undefined;
  setSort: (sort: GroupSortValue | undefined) => void;
}

const GroupSort = ({ sort, setSort }: GroupSortProps) => {
  const { t } = useTranslation();

  return (
    <SortSelect
      fields={groupSortFields}
      labels={{
        prefix: t('library.sort'),
        field: t('groups.sortField'),
        direction: t('groups.sortDirection'),
        default: t('groups.sort.default'),
        fields: { name: t('groups.sort.name'), albumCount: t('groups.sort.albumCount'), trackCount: t('groups.sort.trackCount') },
        directions: { asc: t('groups.sort.asc'), desc: t('groups.sort.desc') },
      }}
      sort={sort}
      setSort={setSort}
    />
  );
};

export default GroupSort;
