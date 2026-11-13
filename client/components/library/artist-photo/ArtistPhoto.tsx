import { useEffect, useState } from 'react';
import type { GroupKind } from '@shared/types/library-query';
import { fetchGroupCover } from '../../../services/library-api';
import { getCoverUrl } from '../../../utils/cover-url';
import style from './ArtistPhoto.scss';

interface ArtistPhotoProps {
  kind: GroupKind;
  /** The name as the library compares it */
  photoKey: string;
  /** Changes when a photo was changed, so the picture is fetched again */
  revision: number;
}

/** The photo of the open artist or album artist, or the cover of one of its albums when it has no photo, as the tile of the group shows it */
const ArtistPhoto = ({ kind, photoKey, revision }: ArtistPhotoProps) => {
  const [cover, setCover] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    fetchGroupCover(kind, photoKey)
      .then((picture) => current && setCover(picture))
      .catch(console.error);
    return () => {
      current = false;
    };
  }, [kind, photoKey, revision]);

  return <span className={style.artistPhoto} style={cover ? { backgroundImage: `url("${getCoverUrl(cover)}")` } : undefined} aria-hidden="true" />;
};

export default ArtistPhoto;
