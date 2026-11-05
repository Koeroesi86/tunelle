import classNames from 'classnames';
import { MdFavorite as FilledHeart, MdFavoriteBorder as OutlineHeart } from 'react-icons/md';
import type { FavouriteKey, NewFavourite } from '@shared/types/favourites';
import { useTranslation } from '../../../i18n';
import style from './FavouriteButton.scss';

interface FavouriteButtonProps {
  item: NewFavourite;
  active: boolean;
  add: (item: NewFavourite) => void;
  remove: (key: FavouriteKey) => void;
  className?: string;
}

/** The heart of a track, album or station: the same everywhere the item shows, because the favourites are in the store */
const FavouriteButton = ({ item, active, add, remove, className }: FavouriteButtonProps) => {
  const { t } = useTranslation();
  const label = t(active ? 'favourites.remove' : 'favourites.add');

  return (
    <button
      type="button"
      className={classNames(style.favouriteButton, { [style.active]: active }, className)}
      title={label}
      aria-label={label}
      aria-pressed={active}
      // a heart sits in rows that select and play on click
      onClick={(event) => {
        event.stopPropagation();
        if (active) remove(item);
        else add(item);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {active ? <FilledHeart size="14px" /> : <OutlineHeart size="14px" />}
    </button>
  );
};

export default FavouriteButton;
