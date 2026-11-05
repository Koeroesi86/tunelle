import classNames from 'classnames';
import type { GroupSummary } from '@shared/types/library';
import { getCoverUrl } from '../../utils/cover-url';
import { useTranslation } from '../../i18n';
import style from './GenreCard.scss';

/** The covers a card fans out, the last one is in front (the query returns no more) */
const maxCovers = 3;

/** How many gradients GenreCard.scss has, the --genre-N-from and -to tokens of the theme */
const toneCount = 12;

interface GenreCardProps {
  group: GroupSummary;
  /** What a genre without a name is called */
  unknownName: string;
  open: (group: GroupSummary) => void;
}

/** The colour of a genre: the same name has the same one in every library and every run */
const toneOf = (key: string) => Array.from(key).reduce((sum, character) => (sum * 31 + (character.codePointAt(0) ?? 0)) % toneCount, 0);

/** A genre as a card with its own colour: the name, how many albums and tracks it has, and up to three covers of its albums fanned out in the corner */
const GenreCard = ({ group, unknownName, open }: GenreCardProps) => {
  const { t } = useTranslation();
  const name = group.name || unknownName;

  return (
    <button type="button" className={classNames(style.genreCard, group.key ? style[`tone${toneOf(group.key)}`] : style.unknown)} onClick={() => open(group)}>
      <span className={style.fan} aria-hidden="true">
        {group.covers.map((cover, index) => (
          <span
            key={cover}
            className={classNames(style.art, style[`art${index + maxCovers - group.covers.length}`])}
            style={{ backgroundImage: `url("${getCoverUrl(cover)}")` }}
          />
        ))}
      </span>
      <span className={style.name} title={name}>
        {name}
      </span>
      <span className={style.counts}>{`${t('groups.albumCount', { count: group.albumCount })} · ${t('groups.trackCount', { count: group.trackCount })}`}</span>
    </button>
  );
};

export default GenreCard;
