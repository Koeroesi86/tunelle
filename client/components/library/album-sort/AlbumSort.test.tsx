import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AlbumSort from './AlbumSort';

const chip = () => screen.getByRole('button', { name: /^Sort albums by/ });
const open = () => fireEvent.click(chip());
const field = (name: string) => screen.getByRole('menuitemradio', { name });
const direction = (name: string) => screen.getByRole('menuitemradio', { name });

describe('AlbumSort', () => {
  it('shows the default order on the chip, and the fields in the menu with the direction out of reach', () => {
    render(<AlbumSort sort={undefined} setSort={vi.fn()} />);

    expect(chip().textContent).toBe('SortDefault order');
    expect(screen.queryByRole('menu')).toBeNull();

    open();

    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'Default order',
      'Title',
      'Artist',
      'Year',
      'Number of tracks',
      'Duration',
      'Ascending',
      'Descending',
    ]);
    expect((direction('Ascending') as HTMLButtonElement).disabled).toBe(true);
    expect(field('Default order').getAttribute('aria-checked')).toBe('true');
  });

  it('shows the sort on the chip and in the menu', () => {
    render(<AlbumSort sort={{ field: 'year', direction: 'desc' }} setSort={vi.fn()} />);
    open();

    expect(chip().getAttribute('aria-label')).toBe('Sort albums by: Year');
    expect(field('Year').getAttribute('aria-checked')).toBe('true');
    expect(direction('Descending').getAttribute('aria-checked')).toBe('true');
    expect((direction('Ascending') as HTMLButtonElement).disabled).toBe(false);
  });

  it('picks a field ascending from the default order, and keeps the direction when the field changes', () => {
    const setSort = vi.fn();
    const { rerender } = render(<AlbumSort sort={undefined} setSort={setSort} />);
    open();

    fireEvent.click(field('Artist'));
    rerender(<AlbumSort sort={{ field: 'artist', direction: 'desc' }} setSort={setSort} />);
    open();
    fireEvent.click(field('Title'));

    expect(setSort.mock.calls).toEqual([[{ field: 'artist', direction: 'asc' }], [{ field: 'title', direction: 'desc' }]]);
  });

  it('closes the menu once a field is picked, and keeps it open for the direction', () => {
    render(<AlbumSort sort={{ field: 'title', direction: 'asc' }} setSort={vi.fn()} />);
    open();

    fireEvent.click(direction('Descending'));
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(field('Year'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('sets the direction, and goes back to the default order', () => {
    const setSort = vi.fn();
    render(<AlbumSort sort={{ field: 'title', direction: 'asc' }} setSort={setSort} />);
    open();

    fireEvent.click(direction('Descending'));
    fireEvent.click(field('Default order'));

    expect(setSort.mock.calls).toEqual([[{ field: 'title', direction: 'desc' }], [undefined]]);
  });

  it('closes with Escape and gives the focus back to the chip', () => {
    render(<AlbumSort sort={undefined} setSort={vi.fn()} />);
    open();
    field('Title').focus();

    fireEvent.keyDown(field('Title'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(chip());
  });
});
