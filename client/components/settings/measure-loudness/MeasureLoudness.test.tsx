import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LoudnessProgress } from '@shared/types/loudness';
import MeasureLoudness from './MeasureLoudness';

const view = (props: Partial<Parameters<typeof MeasureLoudness>[0]> = {}) => {
  // the connected component's dispatch answers with the action, which an effect must not hand back to React
  const actions = { setEnabled: vi.fn(), loadStatus: vi.fn(() => ({})), loadFailed: vi.fn(() => ({})), clear: vi.fn() };
  render(<MeasureLoudness enabled status={undefined} failed={undefined} {...actions} {...props} />);
  return actions;
};

const progress = (values: Partial<LoudnessProgress>): LoudnessProgress => ({ total: 10, measured: 0, failed: 0, ...values });

describe('MeasureLoudness', () => {
  it('asks how far the measurement is when it opens', () => {
    const { loadStatus } = view();

    expect(loadStatus).toHaveBeenCalledTimes(1);
  });

  it('asks again when it is turned on or off', () => {
    const actions = { setEnabled: vi.fn(), loadStatus: vi.fn(() => ({})), loadFailed: vi.fn(() => ({})), clear: vi.fn() };
    const { rerender } = render(<MeasureLoudness enabled status={undefined} failed={undefined} {...actions} />);

    rerender(<MeasureLoudness enabled={false} status={undefined} failed={undefined} {...actions} />);

    expect(actions.loadStatus).toHaveBeenCalledTimes(2);
  });

  it('says what the measurement does, and turns it off', () => {
    const { setEnabled } = view();

    expect(screen.getByText(/are measured in the background/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Measure loudness' }));
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('says that tracks play as they are while it is off, and turns it on', () => {
    const { setEnabled } = view({ enabled: false });

    expect(screen.getByText(/What was measured is kept/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Measure loudness' }));
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('shows no progress before the main process has said how far it is, and nothing to clear', () => {
    view();

    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByRole('button', { name: 'Clear measured values' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows how many tracks are measured', () => {
    view({ status: progress({ measured: 4 }) });

    expect(screen.getByRole('status').textContent).toContain('4 of 10 tracks measured');
  });

  it('says that every track is measured, and how many could not be', () => {
    view({ status: progress({ measured: 9, failed: 1 }) });

    expect(screen.getByRole('status').textContent).toContain('All tracks are measured.');
    expect(screen.getByRole('status').textContent).toContain('1 track could not be measured');
  });

  it('lists the files that could not be measured in a modal that opens from a link, and closes again', () => {
    const { loadFailed } = view({
      status: progress({ measured: 8, failed: 2 }),
      failed: [
        { path: '/music/Tina/16 - Stagger Lee.flac', reason: 'undecodable' },
        { path: '/music/Eurythmics/01 - I Did It.flac', reason: 'silent' },
      ],
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the files' }));

    expect(loadFailed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Tracks that could not be measured' }).textContent).toContain('16 - Stagger Lee.flac');
    expect(screen.getByText('Cannot be decoded')).toBeTruthy();
    expect(screen.getByText('Silent')).toBeTruthy();
    expect(screen.getByText('/music/Eurythmics/01 - I Did It.flac')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says it is looking while the list is not there yet, and has no link when nothing failed', () => {
    view({ status: progress({ measured: 8, failed: 1 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Show the files' }));
    expect(screen.getByText('Looking for the files…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has no link to the files when every track could be measured', () => {
    view({ status: progress({ measured: 10 }) });

    expect(screen.queryByRole('button', { name: 'Show the files' })).toBeNull();
  });

  it('uses the singular for one track', () => {
    view({ status: progress({ total: 1 }) });

    expect(screen.getByRole('status').textContent).toContain('0 of 1 track measured');
  });

  it('clears the measured values when there are some', () => {
    const { clear } = view({ status: progress({ measured: 2 }) });

    fireEvent.click(screen.getByRole('button', { name: 'Clear measured values' }));

    expect(clear).toHaveBeenCalledTimes(1);
  });
});
