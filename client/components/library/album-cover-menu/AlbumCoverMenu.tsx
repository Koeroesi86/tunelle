import { useEffect, useRef, useState } from 'react';
import { MdPhotoCamera as CoverIcon } from 'react-icons/md';
import type { AlbumCoverFailure } from '@shared/types/album-cover';
import { useTranslation } from '../../../i18n';
import style from './AlbumCoverMenu.scss';

interface AlbumCoverMenuProps {
  /** Why the file that was picked last cannot be used; undefined when nothing failed */
  failure: AlbumCoverFailure | undefined;
  change: (change: 'pick' | 'remove' | 'reset') => void;
}

const changes = ['pick', 'remove', 'reset'] as const;

/** The button of an open album that changes its cover: pick an image from the computer, take the cover away, or get the cover of the tags back */
const AlbumCoverMenu = ({ failure, change }: AlbumCoverMenuProps) => {
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
    <div ref={root} className={style.albumCoverMenu}>
      <button type="button" className={style.toggle} aria-haspopup="menu" aria-expanded={opened} onClick={() => setOpened(!opened)}>
        <CoverIcon size="14px" aria-hidden />
        {t('albumCover.change')}
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
              {t(`albumCover.${item}`)}
            </button>
          ))}
        </div>
      )}
      {failure && (
        <span className={style.failure} role="alert">
          {t(`albumCover.error.${failure}`)}
        </span>
      )}
    </div>
  );
};

export default AlbumCoverMenu;
