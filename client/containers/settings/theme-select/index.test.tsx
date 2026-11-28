import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/theme-select/ThemeSelect';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/theme-select/ThemeSelect', () => ({ default: vi.fn(() => null) }));

describe('the container of ThemeSelect', () => {
  it('shows the theme, and sends another mode or accent', () => {
    const { store, sent } = renderContainer(<Container />);
    const { theme, setMode, setAccent } = propsOf(View);

    expect(theme).toEqual(store.getState().uiState.theme);

    setMode('light');
    setAccent('#112233');

    expect(sent()).toEqual([
      { type: 'SET_THEME_MODE', payload: { mode: 'light' } },
      { type: 'SET_ACCENT', payload: { accent: '#112233' } },
    ]);
  });
});
