import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import QueueIndicator from './QueueIndicator';

describe('QueueIndicator', () => {
  it('shows nothing while the queue is empty', () => {
    const { container } = render(<QueueIndicator tasks={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('names the task when only one runs', () => {
    render(<QueueIndicator tasks={[{ kind: 'scan', target: 'Music', running: true, waiting: 0 }]} />);

    expect(screen.getAllByText('Scanning Music')).toHaveLength(2);
    expect(screen.getByText('Running')).toBeTruthy();
  });

  it('counts the tasks and lists what runs and what waits', () => {
    render(
      <QueueIndicator
        tasks={[
          { kind: 'scan', target: 'Music', running: true, waiting: 0 },
          { kind: 'loudness', running: false, waiting: 120 },
        ]}
      />
    );

    expect(screen.getByText('2 tasks')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toContain('Loudness');
    expect(screen.getByText('120 waiting')).toBeTruthy();
  });
});
