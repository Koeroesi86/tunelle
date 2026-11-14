import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ReduceMotion from './ReduceMotion';

describe('ReduceMotion', () => {
  it('asks to stop the motion', () => {
    const toggle = vi.fn();
    render(<ReduceMotion enabled={false} toggle={toggle} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));

    expect(toggle).toHaveBeenCalledOnce();
  });

  it('shows the motion as stopped once it is', () => {
    render(<ReduceMotion enabled toggle={vi.fn()} />);

    expect(screen.getByRole('switch', { name: 'Reduce motion' }).getAttribute('aria-checked')).toBe('true');
  });
});
