import { useEffect, useId, useRef } from 'react';
import type { MouseEventHandler } from 'react';
import classNames from 'classnames';
import style from './Confirm.scss';
import { useTranslation } from '../../../i18n';
import { useDialogFocus } from '../../../hooks/use-dialog-focus';

interface ConfirmProps {
  message?: string | null;
  confirmLabel?: string;
  /** A message that only has to be read has the one button, the cancel one */
  hideConfirm?: boolean;
  cancelLabel?: string;
  /** A third button for a second way to go on, between the confirm and the cancel one */
  alternateLabel?: string;
  alternate?: MouseEventHandler<HTMLButtonElement>;
  confirm?: MouseEventHandler<HTMLButtonElement>;
  cancel: MouseEventHandler<HTMLButtonElement>;
}

function Confirm({ message, confirm = () => {}, cancel, confirmLabel, cancelLabel, alternate, alternateLabel, hideConfirm = false }: ConfirmProps) {
  const { t } = useTranslation();
  const open = !!message;
  const messageId = useId();
  const dialog = useDialogFocus(open);
  const decline = useRef<HTMLButtonElement>(null);

  // after the hook, which takes the first button: Enter on a question that was just asked must not agree to it
  useEffect(() => {
    if (open) decline.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    // captured and marked as used, so the page behind does not close on the same key
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      decline.current?.click();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  return (
    <>
      <div
        ref={dialog}
        className={classNames(style.confirm, {
          [style.show]: open,
        })}
        role={open ? 'alertdialog' : undefined}
        aria-modal={open || undefined}
        aria-labelledby={open ? messageId : undefined}
        // it stays in the page while it is not shown, out of sight: neither Tab nor a screen reader may reach it then
        inert={!open}
      >
        <div id={messageId} className={style.message}>
          {message}
        </div>
        <div className={style.buttons}>
          {!hideConfirm && (
            <button onClick={confirm} className={style.button}>
              {confirmLabel ?? t('confirm.yes')}
            </button>
          )}
          {alternate && (
            <button onClick={alternate} className={style.button}>
              {alternateLabel}
            </button>
          )}
          <button ref={decline} onClick={cancel} className={style.button}>
            {cancelLabel ?? t('confirm.no')}
          </button>
        </div>
      </div>
      {open && <div className={style.scrim} aria-hidden />}
    </>
  );
}

export default Confirm;
