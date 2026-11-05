import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LauncherIntegration from './LauncherIntegration';

describe('LauncherIntegration', () => {
  it('shows nothing where the app can not add itself to the menu', () => {
    const { container } = render(<LauncherIntegration available={false} enabled={false} external={false} setEnabled={vi.fn()} />);

    expect(container.innerHTML).toBe('');
  });

  it('shows the app is not in the menu, and asks to add it', () => {
    const setEnabled = vi.fn();
    render(<LauncherIntegration available enabled={false} external={false} setEnabled={setEnabled} />);

    expect(screen.getByRole('switch', { name: 'Application menu' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('switch', { name: 'Application menu' }));

    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('asks to remove the app from the menu once it was added', () => {
    const setEnabled = vi.fn();
    render(<LauncherIntegration available enabled external={false} setEnabled={setEnabled} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Application menu' }));

    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('says another tool added the app to the menu, and does not add a second entry', () => {
    const setEnabled = vi.fn();
    render(<LauncherIntegration available enabled={false} external setEnabled={setEnabled} />);

    const toggle = screen.getByRole('switch', { name: 'Application menu' });
    fireEvent.click(toggle);

    expect(screen.getByText('Another tool already added Tunelle to the application menu.')).toBeTruthy();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(setEnabled).not.toHaveBeenCalled();
  });
});
