import type { RenderFavourite } from '../../components/ui/favourite-button/FavouriteButton';
import FavouriteButton from './favourite-button';

/** The heart of the store, for the pages that take it as a prop */
export const renderFavourite: RenderFavourite = (item, className) => <FavouriteButton item={item} className={className} />;
