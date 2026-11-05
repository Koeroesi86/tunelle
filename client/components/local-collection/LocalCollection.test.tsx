import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LibraryView } from '../../redux/types';
import LocalCollection from './LocalCollection';

vi.mock('../album-view', () => ({ default: () => null }));
vi.mock('../group-view', () => ({ default: () => null }));
vi.mock('../track-view', () => ({ default: () => null }));
vi.mock('../folder-management', () => ({ default: () => null }));
vi.mock('../folder-filter', () => ({ default: () => <button>folders</button> }));
vi.mock('../library-search', () => ({ default: () => <input aria-label="search" /> }));
vi.mock('../group-filter', () => ({ default: ({ label }: { label: string }) => <input aria-label={label} /> }));
vi.mock('../group-sort', () => ({ default: () => <button>group sort</button> }));
vi.mock('../album-sort', () => ({ default: () => <button>album sort</button> }));
vi.mock('../rescan-button', () => ({ default: () => <button>Rescan</button> }));

const renderPage = (view: LibraryView, props: Partial<Parameters<typeof LocalCollection>[0]> = {}) =>
  render(<LocalCollection view={view} setView={vi.fn()} groupOpen={false} addFiles={vi.fn()} {...props} />);

describe('LocalCollection', () => {
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
