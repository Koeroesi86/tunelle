import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FolderManagement from './FolderManagement';

const folders = [{ path: '/music/a', lastModified: 1 }];

describe('FolderManagement', () => {
  it('removes a folder only after it is confirmed', () => {
    const removeFolder = vi.fn();
    render(<FolderManagement folders={folders} offlineFolders={[]} addFolders={() => {}} removeFolder={removeFolder} />);

    fireEvent.click(screen.getByText('Remove'));
    expect(removeFolder).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Remove from library'));
    expect(removeFolder).toHaveBeenCalledWith('/music/a');
  });

  it('keeps the folder when the removal is declined', () => {
    const removeFolder = vi.fn();
    render(<FolderManagement folders={folders} offlineFolders={[]} addFolders={() => {}} removeFolder={removeFolder} />);

    fireEvent.click(screen.getByText('Remove'));
    fireEvent.click(screen.getByText('Keep'));

    expect(removeFolder).not.toHaveBeenCalled();
  });

  it('asks to add a folder with the native dialog', () => {
    const addFolders = vi.fn();
    render(<FolderManagement folders={folders} offlineFolders={[]} addFolders={addFolders} removeFolder={() => {}} />);

    fireEvent.click(screen.getByText('Add folder…'));

    expect(addFolders).toHaveBeenCalledTimes(1);
  });

  it('marks a folder that is offline', () => {
    render(<FolderManagement folders={folders} offlineFolders={['/music/a']} addFolders={() => {}} removeFolder={() => {}} />);

    expect(screen.getByText('Unavailable')).not.toBeNull();
  });

  it.each([
    ['a Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', /System Settings/],
    [
      'another system',
      'Mozilla/5.0 (X11; Linux x86_64)',
      /^The folder cannot be reached right now\. Its tracks stay in the library and play again once it is back\.$/,
    ],
  ])('explains an offline folder on %s', (_name, userAgent, hint) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    render(<FolderManagement folders={folders} offlineFolders={['/music/a']} addFolders={() => {}} removeFolder={() => {}} />);

    expect(screen.getByText('Unavailable').title).toMatch(hint);
  });

  it('shows the name of a folder first and the folder it sits in beside it', () => {
    render(<FolderManagement folders={[{ path: '/music/jazz', lastModified: 1 }]} offlineFolders={[]} addFolders={() => {}} removeFolder={() => {}} />);

    expect(screen.getByText('jazz').textContent).toBe('jazz');
    expect(screen.getByText('/music/')).not.toBeNull();
  });

  it('counts the folders', () => {
    render(
      <FolderManagement folders={[...folders, { path: '/music/b', lastModified: 2 }]} offlineFolders={[]} addFolders={() => {}} removeFolder={() => {}} />
    );

    expect(screen.getByText('2 folders')).not.toBeNull();
  });
});
