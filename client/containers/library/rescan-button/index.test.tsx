import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/library/rescan-button/RescanButton';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const send = vi.hoisted(() => vi.fn());

vi.mock('../../../components/library/rescan-button/RescanButton', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../backend/backend', () => ({ getBackend: () => ({ send }) }));

describe('the container of RescanButton', () => {
  it('shows how far the scan is', () => {
    renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, progress: 3, totalCount: 9, scanningFolder: '/music' } }));

    expect(propsOf(View)).toMatchObject({ current: 3, total: 9, scanningFolder: '/music' });
  });

  it('asks for a new scan, and the main process to open a folder', () => {
    const { sent } = renderContainer(<Container />);
    const { onRescan, openFolder } = propsOf(View);

    onRescan();
    openFolder('/music');

    expect(sent()).toEqual([{ type: 'RESCAN_LIBRARY', payload: {} }]);
    expect(send).toHaveBeenCalledWith('OPEN_LIBRARY_PATH', '/music');
  });
});
