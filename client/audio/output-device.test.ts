import { describe, expect, it } from 'vitest';
import { restoreOutputDevice, resolveOutputId } from './output-device';

const dac = { id: 'a1', label: 'USB DAC' };
const speakers = { id: 'b2', label: 'Speakers' };

describe('resolveOutputId', () => {
  it('plays on the default without a choice', () => {
    expect(resolveOutputId(undefined, [dac, speakers])).toBe('');
  });

  it('finds the saved device by its id', () => {
    expect(resolveOutputId(speakers, [dac, speakers])).toBe('b2');
  });

  it('finds a device whose id changed by its name', () => {
    expect(resolveOutputId({ id: 'old', label: 'USB DAC' }, [speakers, dac])).toBe('a1');
  });

  it('falls back to the default when the device is unplugged', () => {
    expect(resolveOutputId(dac, [speakers])).toBe('');
  });

  it('does not match devices by an empty name', () => {
    expect(resolveOutputId({ id: 'old', label: '' }, [{ id: 'x', label: '' }])).toBe('');
  });
});

describe('restoreOutputDevice', () => {
  it('keeps a valid device', () => {
    expect(restoreOutputDevice(dac)).toEqual(dac);
  });

  it.each([undefined, null, 'a1', {}, { id: 1, label: 'x' }, { id: '', label: 'Default' }])('drops %j', (value) => {
    expect(restoreOutputDevice(value)).toBeUndefined();
  });
});
