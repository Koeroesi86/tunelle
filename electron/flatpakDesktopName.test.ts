import { describe, expect, it } from 'vitest';
import { getFlatpakDesktopName } from './flatpakDesktopName';

describe('getFlatpakDesktopName', () => {
  it('is the desktop entry the Flatpak installs', () => {
    expect(getFlatpakDesktopName('io.github.koeroesi86.Tunelle')).toBe('io.github.koeroesi86.Tunelle.desktop');
  });

  it('leaves the name alone outside this Flatpak', () => {
    expect(getFlatpakDesktopName(undefined)).toBeUndefined();
    expect(getFlatpakDesktopName('org.example.Other')).toBeUndefined();
  });
});
