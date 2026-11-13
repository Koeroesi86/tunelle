import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AlbumCoverMenu from './AlbumCoverMenu';

const renderMenu = (props: Partial<Parameters<typeof AlbumCoverMenu>[0]> = {}) => {
  const handlers = { change: vi.fn(), search: vi.fn(), download: vi.fn() };
  const view = render(<AlbumCoverMenu failure={undefined} candidates={undefined} initialQuery="Adam Songs" {...handlers} {...props} />);
  return { ...handlers, view };
};

const toggle = () => screen.getByRole('button', { name: 'Change cover' });

describe('AlbumCoverMenu', () => {
  it('has the menu closed until the button is pressed', () => {
    renderMenu();

    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Choose an image…',
      'Remove the cover',
      'Reset the cover',
      'Search online…',
    ]);
  });

  it.each([
    ['Choose an image…', 'pick'],
    ['Remove the cover', 'remove'],
    ['Reset the cover', 'reset'],
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

  it('shows why the last file could not be used', () => {
    renderMenu({ failure: 'tooLarge' });

    expect(screen.getByRole('alert').textContent).toBe('The image is larger than 2 MB.');
  });

  describe('the search', () => {
    const startSearch = () => {
      fireEvent.click(toggle());
      fireEvent.click(screen.getByRole('menuitem', { name: 'Search online…' }));
    };
    const candidates = {
      query: 'Adam Songs',
      candidates: [
        { name: 'Adam – Songs', picture: 'https://coverartarchive.org/release-group/a/front-250' },
        { name: 'Adam – Hits', picture: 'https://coverartarchive.org/release-group/b/front-250' },
      ],
    };
    const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    it('starts with the artist and the title, and searches the text as it is changed', () => {
      const { search } = renderMenu();
      startSearch();

      const input = screen.getByRole('searchbox', { name: 'Search for an album' });
      expect(input).toHaveProperty('value', 'Adam Songs');
      fireEvent.change(input, { target: { value: '  Adam Hits ' } });
      submit();

      expect(search).toHaveBeenCalledExactlyOnceWith('Adam Hits');
    });

    it('does not search an empty text', () => {
      const { search } = renderMenu();
      startSearch();

      fireEvent.change(screen.getByRole('searchbox'), { target: { value: '   ' } });
      submit();

      expect(search).not.toHaveBeenCalled();
    });

    it('lists the albums found for the text that was searched, and downloads the one that is picked', () => {
      const { download, view } = renderMenu();
      startSearch();
      submit();
      view.rerender(
        <AlbumCoverMenu failure={undefined} candidates={candidates} initialQuery="Adam Songs" change={vi.fn()} search={vi.fn()} download={download} />
      );

      expect(screen.getAllByRole('button').map((button) => button.textContent)).toContain('Adam – Hits');
      fireEvent.click(screen.getByRole('button', { name: 'Adam – Songs' }));

      expect(download).toHaveBeenCalledExactlyOnceWith(candidates.candidates[0].picture);
      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('ignores an answer for another text, leaves out an album whose cover does not load, and says when none is left', () => {
      const { view } = renderMenu();
      startSearch();
      submit();
      const rerender = (found: typeof candidates | undefined) =>
        view.rerender(<AlbumCoverMenu failure={undefined} candidates={found} initialQuery="Adam Songs" change={vi.fn()} search={vi.fn()} download={vi.fn()} />);

      rerender({ ...candidates, query: 'older text' });
      expect(screen.queryByText('Adam – Songs')).toBeNull();

      rerender(candidates);
      screen.getAllByRole('presentation', { hidden: true }).forEach((image) => fireEvent.error(image));

      expect(screen.queryByText('Adam – Songs')).toBeNull();
      expect(screen.getByText('No covers found.')).not.toBeNull();
    });

    it('goes back to the menu', () => {
      renderMenu();
      startSearch();

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));

      expect(screen.getByRole('menu')).not.toBeNull();
    });
  });
});
