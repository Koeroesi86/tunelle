import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Confirm from './Confirm';
import { expectNoViolations } from '../../../test/expect-no-violations';

describe('Confirm', () => {
  it('renders the message with default labels', () => {
    render(<Confirm message="Delete?" cancel={() => {}} />);

    expect(screen.getByText('Delete?')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('has only the cancel button when it only has to be read', () => {
    render(<Confirm message="Done" hideConfirm cancelLabel="Close" cancel={() => {}} />);

    expect(screen.getByText('Close')).toBeTruthy();
    expect(screen.queryByText('Yes')).toBeNull();
  });

  it('renders custom labels', () => {
    render(<Confirm message="Sure?" confirmLabel="Remove" cancelLabel="Keep" cancel={() => {}} />);

    expect(screen.getByText('Remove')).toBeTruthy();
    expect(screen.getByText('Keep')).toBeTruthy();
  });

  it('is only shown when there is a message', () => {
    const { container, rerender } = render(<Confirm message={null} cancel={() => {}} />);
    expect(container.firstElementChild?.classList.contains('show')).toBe(false);

    rerender(<Confirm message="Hi" cancel={() => {}} />);
    expect(container.firstElementChild?.classList.contains('show')).toBe(true);
  });

  it('dims the window behind it only while it is shown', () => {
    const { container, rerender } = render(<Confirm message={null} cancel={() => {}} />);
    expect(container.querySelector('[aria-hidden]')).toBeNull();

    rerender(<Confirm message="Hi" cancel={() => {}} />);
    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
  });

  it('is a dialog named by its question only while it is shown', async () => {
    const { container, rerender } = render(<Confirm message={null} cancel={() => {}} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    rerender(<Confirm message="Delete?" cancel={() => {}} />);

    expect(screen.getByRole('alertdialog', { name: 'Delete?' }).getAttribute('aria-modal')).toBe('true');
    await expectNoViolations(container);
  });

  it('takes its buttons out of reach while it is not shown', () => {
    const { container, rerender } = render(<Confirm message={null} cancel={() => {}} />);
    expect(container.firstElementChild?.hasAttribute('inert')).toBe(true);

    rerender(<Confirm message="Delete?" cancel={() => {}} />);

    expect(container.firstElementChild?.hasAttribute('inert')).toBe(false);
  });

  it('starts on the button that declines, and gives the focus back when it closes', () => {
    const view = (message: string | null) => (
      <>
        <button>Delete</button>
        <Confirm message={message} cancel={() => {}} />
      </>
    );
    const { rerender } = render(view(null));
    screen.getByRole('button', { name: 'Delete' }).focus();

    rerender(view('Sure?'));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'No' }));

    rerender(view(null));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }));
  });

  it('declines with Escape, and keeps the key from what is behind it', () => {
    const cancel = vi.fn();
    const behind = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    document.addEventListener('keydown', behind);
    render(<Confirm message="Sure?" cancel={cancel} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'No' }), { key: 'Escape' });
    document.removeEventListener('keydown', behind);

    expect(cancel).toHaveBeenCalledOnce();
    expect(behind).toHaveReturnedWith(true);
  });

  it('leaves Escape alone while it is not shown', () => {
    const cancel = vi.fn();
    render(<Confirm message={null} cancel={cancel} />);

    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('calls confirm and cancel handlers', () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    render(<Confirm message="Sure?" confirm={confirm} cancel={cancel} />);

    fireEvent.click(screen.getByText('Yes'));
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('No'));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('shows a third button only when it has a handler, and calls it', () => {
    const alternate = vi.fn();
    const { rerender } = render(<Confirm message="Sure?" alternateLabel="Both" cancel={() => {}} />);
    expect(screen.queryByText('Both')).toBeNull();

    rerender(<Confirm message="Sure?" alternateLabel="Both" alternate={alternate} cancel={() => {}} />);
    fireEvent.click(screen.getByText('Both'));

    expect(alternate).toHaveBeenCalledOnce();
  });

  it('does not throw when confirm is omitted', () => {
    render(<Confirm message="Sure?" cancel={() => {}} />);

    expect(() => fireEvent.click(screen.getByText('Yes'))).not.toThrow();
  });
});
