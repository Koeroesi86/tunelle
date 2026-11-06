import { describe, expect, it } from 'vitest';
import { batchSizeSchema, directoryUrlSchema, isFlagSet, secondsSchema } from './environment';

describe('environment', () => {
  it('switches on for 1 only', () => {
    expect([isFlagSet('1'), isFlagSet('true'), isFlagSet(''), isFlagSet(undefined)]).toEqual([true, false, false, false]);
  });

  it.each([
    ['50', 50],
    ['0', 100],
    ['1.5', 100],
    ['999999', 100],
    ['x', 100],
    ['', 100],
    [undefined, 100],
  ])('reads the batch size %s as %s', (value, expected) => {
    expect(batchSizeSchema(1000, 100).parse(value)).toBe(expected);
  });

  it.each([
    ['0', 0],
    ['2.5', 2.5],
    ['-1', 30],
    ['  ', 30],
    ['abc', 30],
    ['Infinity', 30],
    [undefined, 30],
  ])('reads the seconds %s as %s', (value, expected) => {
    expect(secondsSchema(30).parse(value)).toBe(expected);
  });

  it('takes an address and nothing else for the directory', () => {
    expect(directoryUrlSchema.parse('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(directoryUrlSchema.parse('not an address')).toBeUndefined();
    expect(directoryUrlSchema.parse(undefined)).toBeUndefined();
  });
});
