import { useEffect } from 'react';
import type { FailedLoudnessTrack } from '@shared/types/loudness';
import type { MessageKey } from '@shared/locales/translate';
import { useTranslation } from '../../../i18n';
import style from './FailedTracksModal.scss';

interface FailedTracksModalProps {
  tracks: FailedLoudnessTrack[] | undefined;
  close: () => void;
}

const reasonKeys: Record<string, MessageKey> = {
  undecodable: 'measureLoudness.reason.undecodable',
  silent: 'measureLoudness.reason.silent',
  'too-large': 'measureLoudness.reason.too-large',
  timeout: 'measureLoudness.reason.timeout',
  crashed: 'measureLoudness.reason.crashed',
};

const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** The files that could not be measured with why, over the settings; Escape and a click beside it close it */
const FailedTracksModal = ({ tracks, close }: FailedTracksModalProps) => {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  return (
    <>
      <div className={style.scrim} onClick={close} aria-hidden="true" />
      <div className={style.modal} role="dialog" aria-modal="true" aria-label={t('measureLoudness.failedTitle')}>
        <h2 className={style.title}>{t('measureLoudness.failedTitle')}</h2>
        {tracks === undefined && <div className={style.note}>{t('measureLoudness.failedLoading')}</div>}
        {tracks?.length === 0 && <div className={style.note}>{t('measureLoudness.failedEmpty')}</div>}
        <ul className={style.list}>
          {tracks?.map(({ path, reason }) => (
            <li key={path} className={style.item}>
              <span className={style.name}>{fileNameOf(path)}</span>
              <span className={style.reason}>{t(reasonKeys[reason ?? ''] ?? 'measureLoudness.reason.unknown')}</span>
              <span className={style.path}>{path}</span>
            </li>
          ))}
        </ul>
        <button type="button" className={style.close} onClick={close}>
          {t('measureLoudness.closeFailed')}
        </button>
      </div>
    </>
  );
};

export default FailedTracksModal;
