import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import { MdPlaylistAdd as AddIcon } from 'react-icons/md';
import type { Playlist } from '@shared/types/playlists';
import type { PlaylistSource } from '../../../domain/playlists';
import { useTranslation } from '../../../i18n';
import style from './AddToPlaylist.scss';
import NameField from '../../ui/name-field';
import { clamp } from '@shared/utils/clamp';

interface AddToPlaylistProps {
  /** The track or album the menu adds */
  source: PlaylistSource;
  playlists: Playlist[];
  add: (id: number, source: PlaylistSource) => void;
  create: (name: string, source: PlaylistSource) => void;
  className?: string;
  tabIndex?: number;
}

const menuWidth = 220;

/** The button of a track or album that opens a menu of the playlists, with a field to start a new one */
const AddToPlaylist = ({ source, playlists, add, create, className, tabIndex }: AddToPlaylistProps) => {
  const { t } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | undefined>(undefined);
  const [name, setName] = useState('');
  const close = (returnFocus = false) => {
    setPosition(undefined);
    setName('');
    if (returnFocus) button.current?.focus();
  };

  useEffect(() => {
    if (!position) return undefined;

    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && (menu.current?.contains(event.target) || button.current?.contains(event.target))) return;
      close();
    };
    const closeOnBlur = () => close();
    document.addEventListener('mousedown', closeOutside);
    // the menu is placed once, so it does not follow a list that scrolls under it
    window.addEventListener('blur', closeOnBlur);
    window.addEventListener('resize', closeOnBlur);
    // a playlist to pick is what most come for, the name field has the focus when there is none
    (menu.current?.querySelector<HTMLElement>('[role="menuitem"]') ?? menu.current?.querySelector<HTMLElement>('input'))?.focus();
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      window.removeEventListener('blur', closeOnBlur);
      window.removeEventListener('resize', closeOnBlur);
    };
  }, [position]);

  const open = () => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;

    setPosition({ top: rect.bottom + 4, left: clamp(rect.left, 4, window.innerWidth - menuWidth - 4) });
  };

  const submit = () => {
    if (!name.trim()) return;

    create(name.trim(), source);
    close(true);
  };

  /** Escape closes the menu, the arrows go through the playlists and the field */
  const navigate = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const stops = Array.from(menu.current?.querySelectorAll<HTMLElement>('input, [role="menuitem"]') ?? []);
    const next = stops.findIndex((stop) => stop === document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1);
    event.preventDefault();
    stops.at(next % stops.length)?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        tabIndex={tabIndex}
        className={classNames(style.addToPlaylist, className)}
        title={t('playlists.add')}
        aria-label={t('playlists.add')}
        aria-haspopup="menu"
        aria-expanded={position !== undefined}
        // the button sits in rows that select and play on click
        onClick={(event) => {
          event.stopPropagation();
          if (position) close();
          else open();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <AddIcon size="16px" />
      </button>
      {position &&
        createPortal(
          // a portal still passes events up the React tree, to the row that holds the button
          <div
            ref={menu}
            role="menu"
            className={style.menu}
            style={{ ...position, width: menuWidth }}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={navigate}
          >
            <div className={style.title}>{t('playlists.addTo')}</div>
            <NameField
              className={style.create}
              value={name}
              label={t('playlists.newName')}
              submitLabel={t('playlists.create')}
              onChange={setName}
              onSubmit={submit}
            />
            {playlists.length > 0 && (
              <div className={style.list}>
                {playlists.map(({ id, name: playlistName, entries }) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    className={style.item}
                    onClick={() => {
                      add(id, source);
                      close(true);
                    }}
                  >
                    <span className={style.itemName}>{playlistName}</span>
                    <span className={style.itemCount}>{entries.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

export default AddToPlaylist;
