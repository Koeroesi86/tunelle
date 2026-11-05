import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WindowBlur from './WindowBlur';

describe('WindowBlur', () => {
  it('shows nothing where the app blurs the window itself', () => {
    const { container } = render(<WindowBlur available={false} enabled={false} toggle={vi.fn()} />);

    expect(container.innerHTML).toBe('');
  });

  it('asks for translucent panels', () => {
    const toggle = vi.fn();
    render(<WindowBlur available enabled={false} toggle={toggle} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Window blur' }));

    expect(toggle).toHaveBeenCalledOnce();
  });

  it('shows the panels as translucent once they are', () => {
    render(<WindowBlur available enabled toggle={vi.fn()} />);

    expect(screen.getByRole('switch', { name: 'Window blur' }).getAttribute('aria-checked')).toBe('true');
  });
});
