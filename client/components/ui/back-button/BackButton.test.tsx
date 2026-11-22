import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import BackButton from './BackButton';

describe('BackButton', () => {
  it('goes back when it is pressed, and is named for it', () => {
    const onClick = vi.fn();
    render(<BackButton onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
