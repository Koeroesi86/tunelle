import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GroupSort from './GroupSort';

const open = () => fireEvent.click(screen.getByRole('button', { name: /^Sort by/ }));
const item = (name: string) => screen.getByRole('menuitemradio', { name });

describe('GroupSort', () => {
  it('offers the name and the counts, with the direction out of reach until a field is picked', () => {
    render(<GroupSort sort={undefined} setSort={vi.fn()} />);
    open();

    expect(screen.getAllByRole('menuitemradio').map((option) => option.textContent)).toEqual([
      'Default order',
      'Name',
      'Number of albums',
      'Number of tracks',
      'Ascending',
      'Descending',
    ]);
    expect((item('Ascending') as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts a picked field ascending, keeps the direction when the field changes and sets the direction', () => {
    const setSort = vi.fn();
    const { rerender } = render(<GroupSort sort={undefined} setSort={setSort} />);

    open();
    fireEvent.click(item('Number of tracks'));
    rerender(<GroupSort sort={{ field: 'trackCount', direction: 'asc' }} setSort={setSort} />);
    open();
    fireEvent.click(item('Descending'));
    fireEvent.click(item('Default order'));

    expect(setSort).toHaveBeenNthCalledWith(1, { field: 'trackCount', direction: 'asc' });
    expect(setSort).toHaveBeenNthCalledWith(2, { field: 'trackCount', direction: 'desc' });
    expect(setSort).toHaveBeenNthCalledWith(3, undefined);
  });
});
