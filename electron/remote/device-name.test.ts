import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH } from './access';
import { deviceNameOf } from './device-name';

describe('deviceNameOf', () => {
  it('keeps a usual host name', () => {
    expect(deviceNameOf('Mac-1234.local')).toBe('Mac-1234.local');
  });

  it('cuts a host name that is over the limit of the host', () => {
    expect(deviceNameOf('a'.repeat(MAX_NAME_LENGTH + 40))).toHaveLength(MAX_NAME_LENGTH);
  });

  it('falls back to the app name for an empty host name or one of control characters', () => {
    expect([deviceNameOf(''), deviceNameOf('  '), deviceNameOf('\n\t')]).toEqual(['Tunelle', 'Tunelle', 'Tunelle']);
  });
});
