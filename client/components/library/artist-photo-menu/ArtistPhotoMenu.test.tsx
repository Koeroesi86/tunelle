import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ArtistPhotoMenu from './ArtistPhotoMenu';

const renderMenu = (props: Partial<Parameters<typeof ArtistPhotoMenu>[0]> = {}) => {
  const change = vi.fn();
  render(<ArtistPhotoMenu failure={undefined} change={change} {...props} />);
  return change;
};

const toggle = () => screen.getByRole('button', { name: 'Change photo' });

describe('ArtistPhotoMenu', () => {
  it('has the menu closed until the button is pressed', () => {
    renderMenu();

    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Choose an image…', 'Use the album cover', 'Look the photo up again']);
  });

  it.each([
    ['Choose an image…', 'pick'],
    ['Use the album cover', 'remove'],
    ['Look the photo up again', 'reset'],
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

  it('says why the file could not be used', () => {
    renderMenu({ failure: 'tooLarge' });

    expect(screen.getByRole('alert').textContent).toBe('The image is larger than 2 MB.');
  });
});
