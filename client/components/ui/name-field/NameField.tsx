import { useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import classNames from 'classnames';
import style from './NameField.scss';

interface NameFieldProps {
  value: string;
  label: string;
  onChange: (value: string) => void;
  /** Enter, or the button; the value is not checked here */
  onSubmit: () => void;
  /** Escape */
  onCancel?: () => void;
  onBlur?: () => void;
  /** The text of the button next to the field, none shows the field alone */
  submitLabel?: string;
  /** Takes the focus when it shows, and selects the text it starts with */
  autoFocus?: boolean;
  className?: string;
}

const maxNameLength = 200;

/** The field a playlist is named in, the same wherever one is created or renamed */
const NameField = ({ value, label, onChange, onSubmit, onCancel, onBlur, submitLabel, autoFocus = false, className }: NameFieldProps) => {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;

    input.current?.focus();
    input.current?.select();
  }, [autoFocus]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className={classNames(style.nameField, className)} onSubmit={submit}>
      <input
        ref={input}
        value={value}
        maxLength={maxNameLength}
        placeholder={label}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && onCancel?.()}
        onBlur={onBlur}
      />
      {submitLabel && (
        <button type="submit" disabled={!value.trim()}>
          {submitLabel}
        </button>
      )}
    </form>
  );
};

export default NameField;
