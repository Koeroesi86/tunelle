import { FiMaximize2 as MaximizeIcon, FiMinimize2 as RestoreIcon, FiMinus as MinimizeIcon, FiX as CloseIcon } from 'react-icons/fi';
import { useTranslation } from '../../i18n';
import style from './WindowControls.scss';

interface WindowControlsProps {
  maximized: boolean;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

/** The minimize, maximize and close buttons on every platform, at the right end of the title bar */
function WindowControls({ maximized, minimize, maximize, close }: WindowControlsProps) {
  const { t } = useTranslation();

  return (
    <div className={style.windowControls}>
      <button type="button" className={style.button} aria-label={t('window.minimize')} onClick={minimize}>
        <MinimizeIcon size={14} />
      </button>
      <button type="button" className={style.button} aria-label={maximized ? t('window.restore') : t('window.maximize')} onClick={maximize}>
        {maximized ? <RestoreIcon size={13} /> : <MaximizeIcon size={13} />}
      </button>
      <button type="button" className={style.button} aria-label={t('window.close')} onClick={close}>
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

export default WindowControls;
