import { useState } from 'react';
import classNames from 'classnames';
import { MdAdd, MdClose, MdFolder, MdWarningAmber } from 'react-icons/md';
import type { Folder } from '@shared/types/library';
import Confirm from '../../ui/confirm';
import style from './FolderManagement.scss';
import { useTranslation } from '../../../i18n';
import { splitFolderPath } from '../../../utils/folder-name';

interface FolderManagementProps {
  folders: Folder[];
  offlineFolders: string[];
  addFolders: () => void;
  removeFolder: (path: string) => void;
}

// macOS asks once for access to protected folders and may ask again after an update (docs/app/updater.md)
const isMac = () => navigator.userAgent.includes('Macintosh');

const FolderManagement = ({ folders, offlineFolders, addFolders, removeFolder }: FolderManagementProps) => {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState<string>();

  return (
    <section className={classNames(style.folderManagement, style.wide)}>
      <header className={style.header}>
        <h2 className={style.sectionTitle}>{t('folders.title')}</h2>
        <span className={style.count}>{t('folders.count', { count: folders.length })}</span>
        <button className={style.addItems} onClick={addFolders}>
          <MdAdd aria-hidden="true" />
          {t('folders.add')}
        </button>
      </header>
      <ul className={style.folders}>
        {folders.map((folder) => {
          const offline = offlineFolders.includes(folder.path);
          const { name, parent } = splitFolderPath(folder.path);

          return (
            <li key={`folder-${folder.path}`} className={classNames(style.folder, { [style.offline]: offline })}>
              <MdFolder className={style.icon} aria-hidden="true" />
              <span className={style.path} title={folder.path}>
                <span className={style.name}>{name}</span>
                {parent && <span className={style.parent}>{parent}</span>}
              </span>
              {offline && (
                <span className={style.offlineLabel} title={isMac() ? t('folders.offlineHintMac') : t('folders.offlineHint')}>
                  <MdWarningAmber aria-hidden="true" />
                  {t('folders.offline')}
                </span>
              )}
              <button className={style.remove} onClick={() => setRemoving(folder.path)}>
                <MdClose aria-hidden="true" />
                {t('folders.remove')}
              </button>
            </li>
          );
        })}
      </ul>
      <div className={style.dropHint}>{t('folders.drop')}</div>
      <Confirm
        message={removing ? t('folders.removeConfirm', { path: removing }) : null}
        confirmLabel={t('folders.removeLabel')}
        cancelLabel={t('folders.keep')}
        confirm={() => {
          if (removing) removeFolder(removing);
          setRemoving(undefined);
        }}
        cancel={() => setRemoving(undefined)}
      />
    </section>
  );
};

export default FolderManagement;
