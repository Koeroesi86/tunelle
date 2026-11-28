import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/language-select/LanguageSelect';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/language-select/LanguageSelect', () => ({ default: vi.fn(() => null) }));

describe('the container of LanguageSelect', () => {
  it('shows the setting of the store and sends its change', () => {
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, language: 'hu' } }));
    const { language, setLanguage } = propsOf(View);

    setLanguage(undefined);

    expect(language).toEqual('hu');
    expect(sent()).toEqual([{ type: 'SET_LANGUAGE', payload: { language: undefined } }]);
  });
});
