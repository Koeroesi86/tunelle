import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import OnlineSources from './OnlineSources';

const props = (view: Parameters<typeof OnlineSources>[0]['view'], setView = vi.fn()) => ({
  view,
  setView,
  radio: <div>radio-slot</div>,
  nearby: <div>nearby-slot</div>,
  renderServers: (kind: string, openSection: (section: 'albums') => void) => (
    <button type="button" onClick={() => openSection('albums')}>{`servers-${kind}`}</button>
  ),
  renderLibrary: (kind: string, section: string) => <div>{`library-${kind}-${section}`}</div>,
});

describe('OnlineSources', () => {
  it('shows the radio slot', () => {
    render(<OnlineSources {...props('radio')} />);

    expect(screen.getByText('radio-slot')).toBeTruthy();
  });

  it('opens a section of the library from the servers of a kind', () => {
    const setView = vi.fn();
    render(<OnlineSources {...props('plex', setView)} />);
    fireEvent.click(screen.getByText('servers-plex'));

    expect(setView).toHaveBeenCalledWith('plex:albums');
  });

  it('fills the nearby slot and the library only while they are shown', () => {
    const { rerender } = render(<OnlineSources {...props('radio')} />);
    expect(screen.queryByText('nearby-slot')).toBeNull();
    expect(screen.queryByText('library-jellyfin-tracks')).toBeNull();

    rerender(<OnlineSources {...props('nearby')} />);
    expect(screen.getByText('nearby-slot')).toBeTruthy();
    rerender(<OnlineSources {...props('jellyfin:tracks')} />);
    expect(screen.getByText('library-jellyfin-tracks')).toBeTruthy();
  });
});
