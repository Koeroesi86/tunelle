import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { localGroupParts, renderGroupAlbums } from './local-group';

vi.mock('./artist-photo', () => ({ default: ({ photoKey }: { photoKey: string }) => <div>{`photo ${photoKey}`}</div> }));
vi.mock('./artist-photo-menu', () => ({ default: ({ photoKey }: { photoKey: string }) => <div>{`photo menu ${photoKey}`}</div> }));
vi.mock('./album-sort', () => ({ default: () => <div>album sort</div> }));
vi.mock('./group-albums', () => ({ default: ({ toolbar }: { toolbar: unknown }) => <div>{`group albums ${String(toolbar)}`}</div> }));

const shown = (parts: ReturnType<typeof localGroupParts>) => {
  render(
    <>
      {parts.photo}
      {parts.menu}
      {parts.sort}
    </>
  );
};

describe('the parts of an open group of the local library', () => {
  it('offers to change the photo of an artist or album artist that has a name, and the sort of the albums', () => {
    shown(localGroupParts({ kind: 'artist', key: 'adam', name: 'Adam' }));

    expect(screen.getByText('photo adam')).toBeTruthy();
    expect(screen.getByText('photo menu adam')).toBeTruthy();
    expect(screen.getByText('album sort')).toBeTruthy();
  });

  it('has no photo for the tracks without an artist, nor for a genre', () => {
    shown(localGroupParts({ kind: 'albumArtist', key: '', name: '' }));
    shown(localGroupParts({ kind: 'genre', key: 'pop', name: 'Pop' }));

    expect(screen.queryByText(/photo/)).toBeNull();
    expect(screen.getAllByText('album sort')).toHaveLength(2);
  });

  it('shows the albums of the group under the bar', () => {
    render(<>{renderGroupAlbums('bar')}</>);

    expect(screen.getByText('group albums bar')).toBeTruthy();
  });
});
