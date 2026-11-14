import { useEffect, useRef } from 'react';

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Moves the focus into a dialog while it is open, keeps Tab inside it, and gives the focus back to what had it when it closes */
export const useDialogFocus = (open: boolean) => {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return undefined;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    element.querySelector<HTMLElement>(focusable)?.focus();

    const keepInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = [...element.querySelectorAll<HTMLElement>(focusable)];
      const edge = event.shiftKey ? items.at(0) : items.at(-1);
      const target = event.shiftKey ? items.at(-1) : items.at(0);
      if (element.contains(document.activeElement) && document.activeElement !== edge) return;
      event.preventDefault();
      target?.focus();
    };
    document.addEventListener('keydown', keepInside);
    return () => {
      document.removeEventListener('keydown', keepInside);
      previous?.focus();
    };
  }, [open]);

  return dialog;
};
