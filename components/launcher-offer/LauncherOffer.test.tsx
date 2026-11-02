import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LauncherOffer from './LauncherOffer';

const question = 'Add Tunelle to the application menu? You can change this later in the settings.';

describe('LauncherOffer', () => {
  it('asks on the first run from an AppImage and adds the app when the user agrees', () => {
    const setEnabled = vi.fn();
    render(<LauncherOffer available enabled={false} offered={false} external={false} setEnabled={setEnabled} />);

    fireEvent.click(screen.getByText('Add'));

    expect(screen.getByText(question)).toBeTruthy();
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('remembers the answer when the user declines', () => {
    const setEnabled = vi.fn();
    render(<LauncherOffer available enabled={false} offered={false} external={false} setEnabled={setEnabled} />);

    fireEvent.click(screen.getByText('Not now'));

    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([
    ['outside an AppImage', { available: false, enabled: false, offered: false, external: false }],
    ['after it was asked', { available: true, enabled: false, offered: true, external: false }],
    ['when the app is in the menu already', { available: true, enabled: true, offered: false, external: false }],
    ['when another tool added the app to the menu', { available: true, enabled: false, offered: false, external: true }],
  ])('does not ask %s', (_name, state) => {
    render(<LauncherOffer {...state} setEnabled={vi.fn()} />);

    expect(screen.queryByText(question)).toBeNull();
  });
});
