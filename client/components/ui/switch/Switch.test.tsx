import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { expectNoViolations } from '../../../test/expect-no-violations';
import Switch from './Switch';

describe('Switch', () => {
  it('says whether it is on', () => {
    render(<Switch checked label="Artist photos" onChange={vi.fn()} />);

    expect(screen.getByRole('switch', { name: 'Artist photos' }).getAttribute('aria-checked')).toBe('true');
  });

  it('has no accessibility violation, on or off', async () => {
    const { container } = render(
      <>
        <Switch checked label="Artist photos" onChange={vi.fn()} />
        <Switch checked={false} label="Reduce motion" onChange={vi.fn()} />
      </>
    );

    await expectNoViolations(container);
  });

  it('asks for the other state when it is pressed', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} label="Artist photos" onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch'));
    rerender(<Switch checked label="Artist photos" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));

    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });
});
