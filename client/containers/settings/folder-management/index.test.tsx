import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/folder-management/FolderManagement';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/folder-management/FolderManagement', () => ({ default: vi.fn(() => null) }));

describe('the container of FolderManagement', () => {
  it('shows the folders and which are offline, and asks to add or remove one', () => {
    const folders = [{ path: '/music', lastModified: 1 }];
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, folders, offlineFolders: ['/music'] }));
    const props = propsOf(View);

    props.addFolders();
    props.removeFolder('/music');

    expect(props).toMatchObject({ folders, offlineFolders: ['/music'] });
    expect(sent()).toEqual([{ type: 'PICK_FOLDERS' }, { type: 'REMOVE_FOLDER', payload: { path: '/music' } }]);
  });
});
