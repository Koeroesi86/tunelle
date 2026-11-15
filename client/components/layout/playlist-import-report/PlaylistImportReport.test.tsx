import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlaylistImportReport from './PlaylistImportReport';

describe('PlaylistImportReport', () => {
  it('tells what was imported, with one button that closes it', () => {
    const close = vi.fn();
    render(<PlaylistImportReport reports={[{ fileName: '/m/a.m3u', name: 'Mix', status: 'created', imported: 2, unmatched: [], streams: 0 }]} close={close} />);

    expect(screen.getByText(/Mix imported: 2 tracks/)).toBeTruthy();
    expect(screen.queryByText('Yes')).toBeNull();
    fireEvent.click(screen.getByText('Close'));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
