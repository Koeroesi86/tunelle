import { afterEach, describe, expect, it, vi } from 'vitest';

const getGPUFeatureStatus = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ app: { getGPUFeatureStatus } }));

import { hasGpuAcceleration, isAccelerated } from './gpu-acceleration';

const status = (gpu_compositing: string, canvas: string) => ({ gpu_compositing, '2d_canvas': canvas });

describe('isAccelerated', () => {
  it.each(['enabled', 'enabled_on', 'enabled_force'])('is true when the compositing and the canvas are %s', (value) => {
    expect(isAccelerated(status(value, value))).toBe(true);
  });

  it.each([
    ['disabled_software', 'enabled'],
    ['enabled', 'unavailable_software'],
    ['disabled_off', 'disabled_off'],
  ])('is false for the compositing %s with the canvas %s', (compositing, canvas) => {
    expect(isAccelerated(status(compositing, canvas))).toBe(false);
  });
});

describe('hasGpuAcceleration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getGPUFeatureStatus.mockReset();
  });

  it('asks the GPU when nothing is forced', () => {
    getGPUFeatureStatus.mockReturnValue(status('disabled_software', 'unavailable_software'));

    expect(hasGpuAcceleration()).toBe(false);
  });

  it('is forced off by TUNELLE_GPU=0', () => {
    vi.stubEnv('TUNELLE_GPU', '0');
    getGPUFeatureStatus.mockReturnValue(status('enabled', 'enabled'));

    expect(hasGpuAcceleration()).toBe(false);
  });

  it('is forced on by TUNELLE_GPU=1', () => {
    vi.stubEnv('TUNELLE_GPU', '1');
    getGPUFeatureStatus.mockReturnValue(status('disabled_software', 'disabled_software'));

    expect(hasGpuAcceleration()).toBe(true);
  });

  it('asks the GPU for a value that is neither', () => {
    vi.stubEnv('TUNELLE_GPU', 'yes');
    getGPUFeatureStatus.mockReturnValue(status('enabled', 'enabled'));

    expect(hasGpuAcceleration()).toBe(true);
  });
});
