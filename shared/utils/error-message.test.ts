import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('reads an Error and prints anything else', () => {
    expect([new Error('boom'), 'plain', 4].map(errorMessage)).toEqual(['boom', 'plain', '4']);
  });
});
