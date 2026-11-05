import { useEffect, useState } from 'react';
import classNames from 'classnames';
import type { Folder } from '@shared/types/library';
import { electronAPI } from '../../services/electron-api';
import { useLatest } from '../../hooks/use-latest';
import { useTranslation } from '../../i18n';
import style from './PlayerHome.scss';
import AlbumDetails from '../album-details';
import Confirm from '../confirm';
import PlayerControls from '../player-controls';
import AudioComponent from '../audio-component';
import TitleBar from '../title-bar';
import Navigation from '../navigation';
import AudioSpectrum from '../audio-spectrum';
import PlayerTabs from '../player-tabs';
import LauncherOffer from '../launcher-offer';

interface PlayerHomeProps {
  maximized: boolean;
  enableTransparency?: boolean;
  blurred: boolean;
  loaded: boolean;
  folders: Folder[];
  addFiles: (files: FileList) => void;
  onUnload: () => void;
}

interface Confirmation {
  message: string;
  onConfirm: () => void;
}

/** The last dropped path that is, contains or lies inside a folder of the library */
const findContainedPath = (files: FileList, folders: Folder[]) =>
  Array.from(files)
    .map((file) => electronAPI.getPathForFile(file))
    .findLast((filePath) => folders.some((folder) => folder.path.startsWith(filePath) || filePath.startsWith(folder.path)));

const PlayerHome = ({ maximized, enableTransparency = true, blurred, loaded, folders, addFiles, onUnload }: PlayerHomeProps) => {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const latestOnUnload = useLatest(onUnload);

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
        [style.loaded]: loaded,
        [style.blurred]: blurred,
        [style.noBlur]: !blurred,
      })}
    >
      <div className={style.wrapper}>
        <TitleBar />
        <div className={style.mainPanel}>
          <div className={style.library}>
            <div className={style.manageLibrary}>
              <div className={style.manageLibraryPanel}>
                <div className={style.navigationContainer}>
                  <Navigation spectrum={<AudioSpectrum width={180} height={32} capHeight={1} meterCount={45} meterWidth={2} gap={2} />} />
                </div>
              </div>
            </div>
            <PlayerTabs addFiles={addDroppedFiles} />
          </div>
        </div>
        <PlayerControls />
      </div>
      <AlbumDetails />
      <Confirm
        message={confirmation?.message ?? null}
        confirm={() => {
          confirmation?.onConfirm();
          setConfirmation(undefined);
        }}
        cancel={() => setConfirmation(undefined)}
      />
      <LauncherOffer />
      <AudioComponent />
    </div>
  );
};

export default PlayerHome;
