import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ViewSwitcher from './ViewSwitcher';

const views = [
  { view: 'one', label: 'First', panel: <span>first panel</span> },
  { view: 'two', label: 'Second', panel: <span>second panel</span> },
];

describe('ViewSwitcher', () => {
  it('shows a tab for each view and switches on click', () => {
    const setView = vi.fn();
    render(<ViewSwitcher views={views} current="one" setView={setView} />);

    fireEvent.click(screen.getByText('Second'));

    expect(screen.getByText('First')).toBeTruthy();
    expect(setView).toHaveBeenCalledWith('two');
  });

  it('shows the controls only when the tabs are off, since the sidebar picks the view and names it', () => {
    const setView = vi.fn();
    render(<ViewSwitcher views={views} current="two" setView={setView} tabs={false} controls={<button>Rescan</button>} />);

    expect(screen.queryByText('First')).toBeNull();
    expect(screen.queryByText('Second')).toBeNull();
    expect(screen.getByRole('button', { name: 'Rescan' })).toBeTruthy();
    expect(setView).not.toHaveBeenCalled();
  });

  it('has no header at all without tabs and controls, and gives the panels the whole height', () => {
    const { container } = render(<ViewSwitcher views={views} current="one" setView={vi.fn()} tabs={false} />);

    expect(container.querySelector('.viewControls')).toBeNull();
    expect(container.querySelector('.viewPanels')?.classList.contains('headless')).toBe(true);
    expect(screen.getByText('first panel')).toBeTruthy();
  });
});
