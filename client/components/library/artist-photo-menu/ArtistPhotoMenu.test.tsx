import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ArtistPhotoMenu from './ArtistPhotoMenu';

const renderMenu = (props: Partial<Parameters<typeof ArtistPhotoMenu>[0]> = {}) => {
  const handlers = { change: vi.fn(), search: vi.fn(), download: vi.fn() };
  const view = render(<ArtistPhotoMenu failure={undefined} candidates={undefined} name="Adam" searchAllowed {...handlers} {...props} />);
  return { ...handlers, view };
};

const toggle = () => screen.getByRole('button', { name: 'Change photo' });
const startSearch = () => {
  fireEvent.click(toggle());
  fireEvent.click(screen.getByRole('menuitem', { name: 'Search online…' }));
};

describe('ArtistPhotoMenu', () => {
  it('has the menu closed until the button is pressed', () => {
    renderMenu();

    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Choose an image…',
      'Use the album cover',
      'Look the photo up again',
      'Search online…',
    ]);
  });

  it('has no search while the names may not be sent to Deezer', () => {
    renderMenu({ searchAllowed: false });
    fireEvent.click(toggle());

    expect(screen.queryByRole('menuitem', { name: 'Search online…' })).toBeNull();
  });

  it.each([
    ['Choose an image…', 'pick'],
    ['Use the album cover', 'remove'],
    ['Look the photo up again', 'reset'],
  ])('asks for the change of %s and closes', (name, expected) => {
    const { change } = renderMenu();
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

  it('searches for the text typed, which starts as the name, and not for an empty one', () => {
    const { search } = renderMenu();
    startSearch();
    const input = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search for an artist' });
    expect(input.value).toBe('Adam');

    fireEvent.change(input, { target: { value: '  Adam Smith ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(search).toHaveBeenCalledExactlyOnceWith('Adam Smith');
  });

  it('lists what the search found, and uses the one that is picked', () => {
    const candidates = {
      query: 'Adam',
      candidates: [
        { name: 'Adam', picture: 'https://cdn.dzcdn.net/a.jpg' },
        { name: 'Adam Two', picture: 'https://cdn.dzcdn.net/b.jpg' },
      ],
    };
    const { download, view } = renderMenu();
    startSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    view.rerender(
      <ArtistPhotoMenu failure={undefined} candidates={candidates} name="Adam" searchAllowed change={vi.fn()} search={vi.fn()} download={download} />
    );

    expect(screen.getAllByRole('button').map((item) => item.textContent)).toEqual(expect.arrayContaining(['Adam', 'Adam Two']));
    fireEvent.click(screen.getByRole('button', { name: 'Adam Two' }));

    expect(download).toHaveBeenCalledExactlyOnceWith('https://cdn.dzcdn.net/b.jpg');
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('shows no answer to another text than the one searched, says when nothing was found, and goes back to the menu', () => {
    const { view } = renderMenu();
    startSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const answer = (query: string) =>
      view.rerender(
        <ArtistPhotoMenu
          failure={undefined}
          candidates={{ query, candidates: [] }}
          name="Adam"
          searchAllowed
          change={vi.fn()}
          search={vi.fn()}
          download={vi.fn()}
        />
      );

    answer('Eve');
    expect(screen.queryByText('No photos found.')).toBeNull();
    answer('Adam');
    expect(screen.getByText('No photos found.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('menu')).toBeTruthy();
  });
});
