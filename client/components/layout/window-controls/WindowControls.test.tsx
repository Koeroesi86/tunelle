import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WindowControls from './WindowControls';

const renderControls = (maximized = false) => {
  const actions = { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() };
  render(<WindowControls maximized={maximized} {...actions} />);
  return actions;
};

describe('WindowControls', () => {
  it('minimizes', () => {
    const { minimize } = renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));

    expect(minimize).toHaveBeenCalledOnce();
  });

  it('maximizes a window that is not maximized', () => {
    const { maximize } = renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));

    expect(maximize).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });

  it('restores a maximized window with the same button', () => {
    const { maximize } = renderControls(true);

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(maximize).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Maximize' })).toBeNull();
  });

  it('closes', () => {
    const { close } = renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(close).toHaveBeenCalledOnce();
  });
});
