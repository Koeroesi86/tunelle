import { useEffect, useState } from 'react';
import type { GroupKind } from '@shared/types/library-query';
import { coverRouteOf } from '../../../utils/cover-url';
import style from './ArtistPhoto.scss';
import { useResolveUrl } from '../../../hooks/use-resolve-url';

interface ArtistPhotoProps {
  kind: GroupKind;
  /** The name as the library compares it */
  photoKey: string;
  /** Changes when a photo was changed, so the picture is fetched again */
  revision: number;
  /** The picture of the group: its photo, or the cover of one of its albums; nothing when it has none */
  fetchCover: (kind: GroupKind, key: string) => Promise<string | null>;
}

/** The photo of the open artist or album artist, or the cover of one of its albums when it has no photo, as the tile of the group shows it */
const ArtistPhoto = ({ kind, photoKey, revision, fetchCover }: ArtistPhotoProps) => {
  const [cover, setCover] = useState<string | null>(null);
  const resolveUrl = useResolveUrl();

  useEffect(() => {
    let current = true;
    fetchCover(kind, photoKey)
      .then((picture) => current && setCover(picture))
      .catch(console.error);
    return () => {
      current = false;
    };
  }, [kind, photoKey, revision]);

  return <span className={style.artistPhoto} style={cover ? { backgroundImage: `url("${resolveUrl(coverRouteOf(cover))}")` } : undefined} aria-hidden="true" />;
};

export default ArtistPhoto;
