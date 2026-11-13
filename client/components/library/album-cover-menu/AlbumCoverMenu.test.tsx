import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AlbumCoverMenu from './AlbumCoverMenu';

const renderMenu = (failure: Parameters<typeof AlbumCoverMenu>[0]['failure'] = undefined) => {
  const change = vi.fn();
  render(<AlbumCoverMenu failure={failure} change={change} />);
  return change;
};

const toggle = () => screen.getByRole('button', { name: 'Change cover' });

describe('AlbumCoverMenu', () => {
  it('has the menu closed until the button is pressed', () => {
    renderMenu();

    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Choose an image…', 'Remove the cover', 'Reset the cover']);
  });

  it.each([
    ['Choose an image…', 'pick'],
    ['Remove the cover', 'remove'],
    ['Reset the cover', 'reset'],
  ])('asks for the change of %s and closes', (name, expected) => {
    const change = renderMenu();
    fireEvent.click(toggle());

    fireEvent.click(screen.getByRole('menuitem', { name }));

    expect(change).toHaveBeenCalledExactlyOnceWith(expected);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes with Escape and with a press outside, not with one inside', () => {
    renderMenu();
    fireEvent.click(toggle());

    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(screen.queryByRole('menu')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(toggle());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows why the last file could not be used', () => {
    renderMenu('tooLarge');

    expect(screen.getByRole('alert').textContent).toBe('The image is larger than 2 MB.');
  });
});
