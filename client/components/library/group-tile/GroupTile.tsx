import type { GroupSummary } from '@shared/types/library';
import { getCoverUrl } from '../../../utils/cover-url';
import { tileAccent } from '../../../utils/tile-accent';
import { useTranslation } from '../../../i18n';
import style from './GroupTile.scss';

interface GroupTileProps {
  group: GroupSummary;
  /** What a group without a name is called */
  unknownName: string;
  open: (group: GroupSummary) => void;
}

/** An artist or album artist as a tile: the photo or cover, the name and how many albums and tracks it has */
const GroupTile = ({ group, unknownName, open }: GroupTileProps) => {
  const { t } = useTranslation();
  const name = group.name || unknownName;
  const image = group.cover ? `url("${getCoverUrl(group.cover)}")` : undefined;

  return (
    <button type="button" className={style.groupTile} onClick={() => open(group)}>
      <span className={style.frame} ref={tileAccent(group.accent)}>
        <span className={style.cover} style={image ? { backgroundImage: image } : undefined} />
      </span>
      <span className={style.name} title={name}>
        {name}
      </span>
      <span className={style.counts}>{`${t('groups.albumCount', { count: group.albumCount })} · ${t('groups.trackCount', { count: group.trackCount })}`}</span>
    </button>
  );
};

export default GroupTile;
