import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/library/folder-filter/FolderFilter';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/library/folder-filter/FolderFilter', () => ({ default: vi.fn(() => null) }));

describe('the container of FolderFilter', () => {
  it('shows the folders and the chosen ones, and sends another choice', () => {
    const folders = [{ path: '/music', lastModified: 1 }];
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, folders, uiState: { ...state.uiState, libraryFolders: ['/music'] } }));
    const props = propsOf(View);

    props.setSelected([]);

    expect(props).toMatchObject({ folders, selected: ['/music'] });
    expect(sent()).toEqual([{ type: 'SET_LIBRARY_FOLDERS', payload: { folders: [] } }]);
  });
});
