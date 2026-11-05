import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { accentTokens, defaultAccent, panelSurfaces } from '../../client/theme';
import ThemeProvider from './ThemeProvider';

const coverAccent = vi.hoisted(() => vi.fn());

vi.mock('../../client/services/cover-accent', () => ({ coverAccent }));

type Listener = () => void;

const system = { dark: false, listeners: new Set<Listener>() };

const stubMatchMedia = () =>
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return system.dark;
    },
    addEventListener: (_: string, listener: Listener) => system.listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => system.listeners.delete(listener),
  }));

const changeSystem = (dark: boolean) =>
  act(() => {
    system.dark = dark;
    system.listeners.forEach((listener) => listener());
  });

const root = document.documentElement;

describe('ThemeProvider', () => {
  beforeEach(() => {
    system.dark = false;
    system.listeners.clear();
    stubMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    root.removeAttribute('data-theme');
    root.removeAttribute('style');
  });

  it('shows its children', () => {
    render(<ThemeProvider theme={{ mode: 'system', accent: undefined }}>content</ThemeProvider>);

    expect(screen.getByText('content')).toBeTruthy();
  });

  it('follows the system in the system mode, live', () => {
    system.dark = true;
    render(<ThemeProvider theme={{ mode: 'system', accent: undefined }}>content</ThemeProvider>);
    expect(root.dataset.theme).toBe('dark');

    changeSystem(false);
    expect(root.dataset.theme).toBe('light');

    changeSystem(true);
    expect(root.dataset.theme).toBe('dark');
  });

  it.each([
    ['light', true],
    ['light', false],
    ['dark', true],
    ['dark', false],
  ] as const)('shows %s whatever the system is (dark %s)', (mode, systemDark) => {
    system.dark = systemDark;
    render(<ThemeProvider theme={{ mode, accent: undefined }}>content</ThemeProvider>);
    changeSystem(!systemDark);

    expect(root.dataset.theme).toBe(mode);
  });

  it('switches when the picked mode changes, and follows the system again with system', () => {
    system.dark = true;
    const { rerender } = render(<ThemeProvider theme={{ mode: 'light', accent: undefined }}>content</ThemeProvider>);
    expect(root.dataset.theme).toBe('light');

    rerender(<ThemeProvider theme={{ mode: 'system', accent: undefined }}>content</ThemeProvider>);
    expect(root.dataset.theme).toBe('dark');
  });

  it('puts the accent on the root, readable on the theme, and back to the default with undefined', () => {
    const { rerender } = render(<ThemeProvider theme={{ mode: 'dark', accent: '#0000ff' }}>content</ThemeProvider>);
    const blue = accentTokens('#0000ff', 'dark');
    expect(root.style.getPropertyValue('--accent')).toBe(blue['--accent']);
    expect(root.style.getPropertyValue('--accent-contrast')).toBe(blue['--accent-contrast']);

    rerender(<ThemeProvider theme={{ mode: 'light', accent: '#0000ff' }}>content</ThemeProvider>);
    expect(root.style.getPropertyValue('--accent')).toBe(accentTokens('#0000ff', 'light')['--accent']);

    rerender(<ThemeProvider theme={{ mode: 'dark', accent: undefined }}>content</ThemeProvider>);
    expect(root.style.getPropertyValue('--accent')).toBe(defaultAccent);
  });

  it('takes the accent from the cover in the automatic setting, and the default without one', async () => {
    coverAccent.mockResolvedValue('#0000ff');
    const { rerender } = render(
      <ThemeProvider theme={{ mode: 'dark', accent: 'auto' }} cover="tunelle://app/albumart/a-optimized.png">
        content
      </ThemeProvider>
    );
    await waitFor(() => expect(root.style.getPropertyValue('--accent')).toBe(accentTokens('#0000ff', 'dark')['--accent']));
    expect(coverAccent).toHaveBeenCalledWith('tunelle://app/albumart/a-optimized.png');

    rerender(<ThemeProvider theme={{ mode: 'dark', accent: 'auto' }}>content</ThemeProvider>);
    await waitFor(() => expect(root.style.getPropertyValue('--accent')).toBe(defaultAccent));
  });

  it('does not read the cover with a picked accent', () => {
    coverAccent.mockClear();
    render(
      <ThemeProvider theme={{ mode: 'dark', accent: '#0000ff' }} cover="tunelle://app/albumart/a-optimized.png">
        content
      </ThemeProvider>
    );

    expect(coverAccent).not.toHaveBeenCalled();
  });

  it('stops listening to the system once it is gone', () => {
    const { unmount } = render(<ThemeProvider theme={{ mode: 'system', accent: undefined }}>content</ThemeProvider>);
    unmount();

    expect(system.listeners.size).toBe(0);
  });
});

describe('the stylesheet of the theme', () => {
  const stylesheet = readFileSync(resolve(__dirname, 'ThemeProvider.scss'), 'utf8');

  it.each(['dark', 'light'] as const)('shows the %s default accent and panel until the provider runs', (theme) => {
    const set = stylesheet.split(new RegExp(`@mixin ${theme} \\{`))[1].split('\n}\n')[0];
    const { '--accent': accent, '--accent-contrast': contrast } = accentTokens(undefined, theme);

    expect(set).toContain(`--accent: ${accent};`);
    expect(set).toContain(`--accent-contrast: ${contrast};`);
    expect(set).toContain(`--panel-solid: ${panelSurfaces[theme]};`);
  });
});
