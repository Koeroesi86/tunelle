import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/layout/language-provider/LanguageProvider';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/layout/language-provider/LanguageProvider', () => ({ default: vi.fn(() => null) }));

describe('the container of LanguageProvider', () => {
  it('gives the language of the settings', () => {
    renderContainer(<Container>text</Container>, (state) => ({ ...state, uiState: { ...state.uiState, language: 'hu' } }));

    expect(propsOf(View).language).toBe('hu');
  });
});
