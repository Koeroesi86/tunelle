import { describe, expect, it } from 'vitest';
import { hasErrorCode } from './has-error-code';

const withCode = (code: unknown) => Object.assign(new Error('x'), { code });

describe('hasErrorCode', () => {
  it('matches the code of a system error', () => {
    expect(hasErrorCode(withCode('ENOENT'), 'ENOENT')).toBe(true);
  });

  it('matches any of several codes', () => {
    expect([withCode('ENOENT'), withCode('ENOTDIR'), withCode('EEXIST')].map((error) => hasErrorCode(error, 'ENOENT', 'ENOTDIR'))).toEqual([true, true, false]);
  });

  it('does not match an error without a code, a code that is not text, or something that is not an error', () => {
    expect([new Error('x'), withCode(2), { code: 'ENOENT' }, 'ENOENT', undefined].map((error) => hasErrorCode(error, 'ENOENT'))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
