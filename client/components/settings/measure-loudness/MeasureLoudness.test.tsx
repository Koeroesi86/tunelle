import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LoudnessProgress } from '@shared/types/loudness';
import MeasureLoudness from './MeasureLoudness';

const view = (props: Partial<Parameters<typeof MeasureLoudness>[0]> = {}) => {
  // the connected component's dispatch answers with the action, which an effect must not hand back to React
  const actions = { setEnabled: vi.fn(), loadStatus: vi.fn(() => ({})), clear: vi.fn() };
  render(<MeasureLoudness enabled status={undefined} {...actions} {...props} />);
  return actions;
};

const progress = (values: Partial<LoudnessProgress>): LoudnessProgress => ({ total: 10, measured: 0, failed: 0, ...values });

describe('MeasureLoudness', () => {
  it('asks how far the measurement is when it opens', () => {
    const { loadStatus } = view();

    expect(loadStatus).toHaveBeenCalledTimes(1);
  });

  it('asks again when it is turned on or off', () => {
    const actions = { setEnabled: vi.fn(), loadStatus: vi.fn(() => ({})), clear: vi.fn() };
    const { rerender } = render(<MeasureLoudness enabled status={undefined} {...actions} />);

    rerender(<MeasureLoudness enabled={false} status={undefined} {...actions} />);

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
