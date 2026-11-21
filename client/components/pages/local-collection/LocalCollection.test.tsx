import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LibraryView } from '../../../redux/types';
import LocalCollection from './LocalCollection';

const panels = {
  albums: 'albums list',
  artists: 'artists list',
  albumArtists: 'album artists list',
  genres: 'genres list',
  tracks: 'tracks list',
  folders: 'folders list',
};
const controls = {
  search: <input aria-label="search" />,
  groupFilter: (label: string) => <input aria-label={label} />,
  folderFilter: <button>folders</button>,
  albumSort: <button>album sort</button>,
  groupSort: <button>group sort</button>,
  rescan: <button>Rescan</button>,
};

const renderPage = (view: LibraryView, props: Partial<Parameters<typeof LocalCollection>[0]> = {}) =>
  render(<LocalCollection view={view} setView={vi.fn()} groupOpen={false} addFiles={vi.fn()} panels={panels} controls={controls} {...props} />);

describe('LocalCollection', () => {
  it('renders the list of the view that is shown, and the lists of names only while they are shown', () => {
    renderPage('artists');

    expect(screen.getByText('artists list')).toBeTruthy();
    expect(screen.queryByText('genres list')).toBeNull();
    expect(screen.queryByText('album artists list')).toBeNull();
  });

  it('puts the search, the folders, the sort of the albums and the rescan in one row, without a title', () => {
    renderPage('albums');

    expect(screen.getByRole('textbox', { name: 'search' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'folders' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'album sort' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rescan' })).toBeTruthy();
    expect(screen.queryByText('Albums')).toBeNull();
  });

  it('leaves the sort of the albums to the other views, which sort in their own bar', () => {
    renderPage('artists');

    expect(screen.queryByRole('button', { name: 'album sort' })).toBeNull();
  });

  it('filters the names of the artists and album artists in the field of the header, with their sort next to the folders and no second row', () => {
    renderPage('albumArtists');

    expect(screen.getByRole('textbox', { name: 'Filter by name' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'search' })).toBeNull();
    expect(screen.getByRole('button', { name: 'group sort' })).toBeTruthy();
  });

  it('filters the genres by name too, and sorts them with the same chip', () => {
    renderPage('genres');

    expect(screen.getByRole('textbox', { name: 'Filter by name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'group sort' })).toBeTruthy();
  });

  it('searches the albums of an open artist with the search of the library again', () => {
    renderPage('artists', { groupOpen: true });

    expect(screen.getByRole('textbox', { name: 'search' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Filter by name' })).toBeNull();
  });

  it('has no search or folders on the page of the folders', () => {
    renderPage('folders');

    expect(screen.queryByRole('textbox', { name: 'search' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'folders' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rescan' })).toBeTruthy();
  });
});
