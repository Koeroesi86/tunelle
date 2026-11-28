import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/layout/queue-indicator/QueueIndicator';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/layout/queue-indicator/QueueIndicator', () => ({ default: vi.fn(() => null) }));

describe('the container of QueueIndicator', () => {
  it('shows the tasks of the background', () => {
    const { store } = renderContainer(<Container />);

    expect(propsOf(View).tasks).toBe(store.getState().uiState.backgroundTasks);
  });
});
