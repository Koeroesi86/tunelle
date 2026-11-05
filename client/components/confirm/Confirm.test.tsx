import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Confirm from './Confirm';

describe('Confirm', () => {
  it('renders the message with default labels', () => {
    render(<Confirm message="Delete?" cancel={() => {}} />);

    expect(screen.getByText('Delete?')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
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

  it('does not throw when confirm is omitted', () => {
    render(<Confirm message="Sure?" cancel={() => {}} />);

    expect(() => fireEvent.click(screen.getByText('Yes'))).not.toThrow();
  });
});
