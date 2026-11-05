import type { MouseEventHandler } from 'react';
import classNames from 'classnames';
import style from './Confirm.scss';
import { useTranslation } from '../../i18n';

interface ConfirmProps {
  message?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  confirm?: MouseEventHandler<HTMLButtonElement>;
  cancel: MouseEventHandler<HTMLButtonElement>;
}

function Confirm({ message, confirm = () => {}, cancel, confirmLabel, cancelLabel }: ConfirmProps) {
  const { t } = useTranslation();

  return (
    <>
      <div
        className={classNames(style.confirm, {
          [style.show]: message,
        })}
      >
        <div className={style.message}>{message}</div>
        <div className={style.buttons}>
          <button onClick={confirm} className={style.button}>
            {confirmLabel ?? t('confirm.yes')}
          </button>
          <button onClick={cancel} className={style.button}>
            {cancelLabel ?? t('confirm.no')}
          </button>
        </div>
      </div>
      {message && <div className={style.scrim} aria-hidden />}
    </>
  );
}

export default Confirm;
