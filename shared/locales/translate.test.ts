import { describe, expect, it } from 'vitest';
import { createTranslator, matchLanguage, resolveLanguage } from './translate';
import type { Catalog } from './translate';

const supported = ['en', 'hu', 'pt', 'pt-BR'];

describe('matchLanguage', () => {
  it.each([
    ['hu', 'hu'],
    ['hu-HU', 'hu'],
    ['pt-BR', 'pt-BR'],
    ['pt_br', 'pt-BR'],
    ['pt-PT', 'pt'],
    ['PT', 'pt'],
    ['de', undefined],
    ['', undefined],
    [undefined, undefined],
  ])('matches %s to %s', (tag, expected) => {
    expect(matchLanguage(tag, supported)).toBe(expected);
  });
});

describe('resolveLanguage', () => {
  it('prefers the picked language to the system', () => {
    expect(resolveLanguage('pt-BR', ['hu-HU'], supported)).toBe('pt-BR');
  });

  it('follows the system without a picked language', () => {
    expect(resolveLanguage(undefined, ['hu-HU'], supported)).toBe('hu');
  });

  it('takes the first system language that is supported', () => {
    expect(resolveLanguage(undefined, ['de-DE', 'pt-PT', 'hu'], supported)).toBe('pt');
  });

  it('skips a picked language that is no longer supported', () => {
    expect(resolveLanguage('de', ['hu'], supported)).toBe('hu');
  });

  it('shows English when nothing is supported', () => {
    expect(resolveLanguage('de', ['fr-FR', 'ja'], supported)).toBe('en');
    expect(resolveLanguage(undefined, [], supported)).toBe('en');
  });
});

describe('createTranslator', () => {
  // the keys of t are the real ones, the messages of the test are its own
  const english = {
    'launcher.offer': 'Hello {name}',
    'confirm.yes': 'Only English',
    'player.play_one': '{count} item',
    'player.play_other': '{count} items',
  };
  const catalog: Catalog = { hu: { 'launcher.offer': 'Szia {name}', 'player.play_one': '{count} elem', 'player.play_other': '{count} elem' } };
  const translator = (language: string) => createTranslator(language, catalog, english);

  it('shows the message of the language with its values', () => {
    expect(translator('hu').t('launcher.offer', { name: 'Kriszta' })).toBe('Szia Kriszta');
  });

  it('shows the English message when the language lacks the key', () => {
    expect(translator('hu').t('confirm.yes')).toBe('Only English');
  });

  it('shows the English message when the language has no messages at all', () => {
    expect(translator('de').t('launcher.offer', { name: 'Kriszta' })).toBe('Hello Kriszta');
  });

  it('shows the key when English lacks it too', () => {
    expect(translator('hu').t('confirm.no')).toBe('confirm.no');
  });

  it('keeps a placeholder without a value', () => {
    expect(translator('en').t('launcher.offer')).toBe('Hello {name}');
  });

  it('picks the plural of the count', () => {
    expect(translator('en').t('player.play', { count: 1 })).toBe('1 item');
    expect(translator('en').t('player.play', { count: 3 })).toBe('3 items');
  });

  it('formats numbers by the language', () => {
    expect(translator('hu').formatNumber(1234.5)).toBe(new Intl.NumberFormat('hu').format(1234.5));
    expect(translator('en').formatNumber(5, { minimumIntegerDigits: 2 })).toBe('05');
  });
});
