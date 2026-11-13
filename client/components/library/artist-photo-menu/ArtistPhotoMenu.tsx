import { useEffect, useRef, useState } from 'react';
import { MdPhotoCamera as PhotoIcon } from 'react-icons/md';
import type { ArtistPhotoFailure } from '@shared/types/artist-photo';
import { useTranslation } from '../../../i18n';
import style from './ArtistPhotoMenu.scss';

interface ArtistPhotoMenuProps {
  /** Why the file that was picked last cannot be used, undefined when nothing failed */
  failure: ArtistPhotoFailure | undefined;
  change: (change: 'pick' | 'remove' | 'reset') => void;
}

const changes = ['pick', 'remove', 'reset'] as const;

/** The button of an open artist that changes its photo: a menu to pick an image from the computer, to show the cover of an album, or to look the photo up again */
const ArtistPhotoMenu = ({ failure, change }: ArtistPhotoMenuProps) => {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!opened) return undefined;

    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpened(false);
    const onPointer = (event: PointerEvent) => event.target instanceof Node && !root.current?.contains(event.target) && setOpened(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [opened]);

  return (
    <div ref={root} className={style.artistPhotoMenu}>
      <button type="button" className={style.toggle} aria-haspopup="menu" aria-expanded={opened} onClick={() => setOpened(!opened)}>
        <PhotoIcon size="14px" aria-hidden />
        {t('artistPhoto.change')}
      </button>
      {opened && (
        <div className={style.menu} role="menu">
          {changes.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitem"
              className={style.item}
              onClick={() => {
                setOpened(false);
                change(item);
              }}
            >
              {t(`artistPhoto.${item}`)}
            </button>
          ))}
        </div>
      )}
      {failure && (
        <span className={style.failure} role="alert">
          {t(`artistPhoto.error.${failure}`)}
        </span>
      )}
    </div>
  );
};

export default ArtistPhotoMenu;
