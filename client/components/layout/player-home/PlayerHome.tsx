import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import classNames from 'classnames';
import type { Folder } from '@shared/types/library';
import { getBackend } from '../../../backend/backend';
import { useLatest } from '../../../hooks/use-latest';
import { useBreakpoint } from '../../../hooks/use-breakpoint';
import { useTranslation } from '../../../i18n';
import style from './PlayerHome.scss';
import Confirm from '../../ui/confirm';
import { playerId } from '../player-controls/PlayerControls';
import AudioSpectrum from '../audio-spectrum';

/** What the window tells the bar and the navigation it holds */
export interface TitleBarSlot {
  onMenu?: () => void;
  menuOpen: boolean;
}
export interface NavigationSlot {
  rail: boolean;
  onNavigate: () => void;
  spectrum: ReactNode;
}

interface PlayerHomeProps {
  maximized: boolean;
  enableTransparency?: boolean;
  blurred: boolean;
  loaded: boolean;
  folders: Folder[];
  addFiles: (files: FileList) => void;
  onUnload: () => void;
  renderTitleBar: (slot: TitleBarSlot) => ReactNode;
  renderNavigation: (slot: NavigationSlot) => ReactNode;
  /** The pages, which take the files that are dropped on the window */
  renderTabs: (addFiles: (files: FileList) => void) => ReactNode;
  controls: ReactNode;
  /** What is not part of the layout: the offers and reports over the window, and the audio */
  overlays: ReactNode;
}

interface Confirmation {
  message: string;
  onConfirm: () => void;
}

/** The last dropped path that is, contains or lies inside a folder of the library */
const findContainedPath = (files: FileList, folders: Folder[]) =>
  Array.from(files)
    .map((file) => getBackend().pathForFile(file))
    .findLast((filePath) => folders.some((folder) => folder.path.startsWith(filePath) || filePath.startsWith(folder.path)));

const PlayerHome = ({
  maximized,
  enableTransparency = true,
  blurred,
  loaded,
  folders,
  addFiles,
  onUnload,
  renderTitleBar,
  renderNavigation,
  renderTabs,
  controls,
  overlays,
}: PlayerHomeProps) => {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const latestOnUnload = useLatest(onUnload);
  const breakpoint = useBreakpoint();
  const compact = breakpoint === 'compact';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerShown = compact && drawerOpen;

  // a window that grows out of the compact size has the sidebar, so the drawer starts closed when it shrinks again
  useEffect(() => {
    if (!compact) setDrawerOpen(false);
  }, [compact]);

  useEffect(() => {
    if (!drawerShown) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawerShown]);

  useEffect(() => {
    const save = () => latestOnUnload.current();
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, []);

  const addDroppedFiles = (files: FileList) => {
    if (files.length === 0) return;

    const contained = findContainedPath(files, folders);
    if (contained) setConfirmation({ message: t('folders.addConfirm', { path: contained }), onConfirm: () => addFiles(files) });
    else addFiles(files);
  };

  return (
    <div
      className={classNames(style.playerHome, {
        [style.opaque]: enableTransparency,
        [style.maximized]: maximized,
        [style.compact]: compact,
        [style.medium]: breakpoint === 'medium',
        [style.drawerOpen]: drawerShown,
        [style.loaded]: loaded,
        [style.blurred]: blurred,
        [style.noBlur]: !blurred,
      })}
    >
      <button type="button" className={style.skipLink} onClick={() => document.getElementById(playerId)?.focus()}>
        {t('a11y.skipToPlayer')}
      </button>
      <div className={style.wrapper}>
        {renderTitleBar({ onMenu: compact ? () => setDrawerOpen((open) => !open) : undefined, menuOpen: drawerShown })}
        <div className={style.mainPanel}>
          <div className={style.library}>
            {drawerShown && <button type="button" className={style.scrim} aria-label={t('nav.closeMenu')} onClick={() => setDrawerOpen(false)} />}
            <div className={style.manageLibrary}>
              <div className={style.manageLibraryPanel}>
                <div className={style.navigationContainer}>
                  {renderNavigation({
                    rail: breakpoint === 'medium',
                    onNavigate: () => setDrawerOpen(false),
                    spectrum: <AudioSpectrum width={180} height={32} capHeight={1} meterCount={45} meterWidth={2} gap={2} />,
                  })}
                </div>
              </div>
            </div>
            {renderTabs(addDroppedFiles)}
          </div>
        </div>
        {controls}
      </div>
      <Confirm
        message={confirmation?.message ?? null}
        confirm={() => {
          confirmation?.onConfirm();
          setConfirmation(undefined);
        }}
        cancel={() => setConfirmation(undefined)}
      />
      {overlays}
    </div>
  );
};

export default PlayerHome;
