import classNames from 'classnames';
import { FaSyncAlt } from 'react-icons/fa';
import { electronAPI } from '../../services/electron-api';
import { displayFolderPath } from '../../utils/folder-name';
import { useTranslation } from '../../i18n';
import style from './RescanButton.scss';

interface RescanButtonProps {
  /** The files scanned so far, and how many there are to scan, which is 0 until the count is known */
  current: number;
  total: number;
  scanningFolder: string | null;
  onRescan: () => void;
}

const ringSize = 30;
const ringStroke = 2.5;
const ringRadius = (ringSize - ringStroke) / 2;
const ringLength = 2 * Math.PI * ringRadius;

/** The rescan of the library, which shows the progress of a scan as a ring around it, and the folder and the count in a popover */
const RescanButton = ({ current, total, scanningFolder, onRescan }: RescanButtonProps) => {
  const { t, formatNumber } = useTranslation();
  const fraction = total === 0 ? 0 : Math.min(1, current / total);

  return (
    <div className={style.rescanButton}>
      <button
        type="button"
        title={t('library.rescan')}
        aria-label={t('library.rescan')}
        onClick={onRescan}
        disabled={!!scanningFolder}
        className={classNames(style.button, { [style.spinning]: scanningFolder })}
      >
        {scanningFolder && (
          <svg className={style.ring} width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} aria-hidden="true">
            <circle className={style.ringTrack} cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} strokeWidth={ringStroke} />
            <circle
              className={style.ringFill}
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              strokeWidth={ringStroke}
              strokeDasharray={ringLength}
              strokeDashoffset={ringLength * (1 - fraction)}
            />
          </svg>
        )}
        <FaSyncAlt />
      </button>
      {scanningFolder && (
        <div className={style.popover} role="status">
          <div className={style.heading}>
            <span>{t('scan.title')}</span>
            {total > 0 && <span className={style.percent}>{Math.floor(fraction * 100)}%</span>}
          </div>
          <div className={style.bar}>
            <div className={style.barFill} style={{ transform: `scaleX(${fraction})` }} />
          </div>
          {total > 0 && <div className={style.muted}>{t('scan.count', { current: formatNumber(current), total: formatNumber(total) })}</div>}
          <button
            type="button"
            className={style.folder}
            title={t('scan.open', { folder: displayFolderPath(scanningFolder) })}
            onClick={() => electronAPI.send('OPEN_LIBRARY_PATH', scanningFolder)}
          >
            {displayFolderPath(scanningFolder)}
          </button>
        </div>
      )}
    </div>
  );
};

export default RescanButton;
