import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useDialogFocus } from './use-dialog-focus';

const Dialog = ({ open }: { open: boolean }) => {
  const dialog = useDialogFocus(open);

  return open ? (
    <div ref={dialog} role="dialog">
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  ) : null;
};

describe('useDialogFocus', () => {
  it('moves the focus in, keeps Tab inside and gives the focus back on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<Dialog open />);

    expect(document.activeElement).toBe(screen.getByText('First'));

    screen.getByText('Last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('First'));

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('Last'));

    rerender(<Dialog open={false} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('leaves Tab to a dialog that opened over it', () => {
    render(
      <>
        <Dialog open />
        <div aria-modal="true">
          <button type="button">Over one</button>
          <button type="button">Over two</button>
        </div>
      </>
    );
    screen.getByText('Over one').focus();

    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(screen.getByText('Over one'));
  });

  it('does not hold Tab while the dialog is on a page that is hidden', () => {
    render(
      <div style={{ visibility: 'hidden' }}>
        <Dialog open />
      </div>
    );

    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
  });
});
