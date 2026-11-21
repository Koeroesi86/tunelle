import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  getGPUFeatureStatus: vi.fn(),
  loadURL: vi.fn(),
  destroy: vi.fn(),
  windows: vi.fn(),
  on: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getGPUFeatureStatus: electron.getGPUFeatureStatus, on: electron.on },
  BrowserWindow: class {
    constructor(options: unknown) {
      electron.windows(options);
    }
    loadURL = electron.loadURL;
    destroy = electron.destroy;
  },
}));

const status = (gpu_compositing: string, canvas: string) => ({ gpu_compositing, '2d_canvas': canvas });

const load = async () => {
  vi.resetModules();

  return import('./gpu-acceleration');
};

describe('isAccelerated', () => {
  it.each(['enabled', 'enabled_on', 'enabled_force'])('is true when the compositing and the canvas are %s', async (value) => {
    expect((await load()).isAccelerated(status(value, value))).toBe(true);
  });

  it.each([
    ['disabled_software', 'enabled'],
    ['enabled', 'unavailable_software'],
    ['disabled_off', 'disabled_off'],
  ])('is false for the compositing %s with the canvas %s', async (compositing, canvas) => {
    expect((await load()).isAccelerated(status(compositing, canvas))).toBe(false);
  });
});

describe('hasGpuAcceleration', () => {
  beforeEach(() => {
    electron.loadURL.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.values(electron).forEach((mock) => mock.mockReset());
  });

  it('reads the status once a hidden window has shown a page, and closes the window', async () => {
    electron.getGPUFeatureStatus.mockImplementation(() =>
      electron.loadURL.mock.calls.length > 0 ? status('enabled', 'enabled') : status('disabled_software', 'disabled_software')
    );
    const { hasGpuAcceleration } = await load();

    expect(await hasGpuAcceleration()).toBe(true);
    expect(electron.windows).toHaveBeenCalledWith(expect.objectContaining({ show: false }));
    expect(electron.destroy).toHaveBeenCalledOnce();
  });

  it('keeps the app open when the probe window is the last one that closes', async () => {
    electron.getGPUFeatureStatus.mockReturnValue(status('enabled', 'enabled'));
    await (await load()).hasGpuAcceleration();

    expect(electron.on).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
  });

  it('is false when the page was drawn in software', async () => {
    electron.getGPUFeatureStatus.mockReturnValue(status('disabled_software', 'disabled_software'));

    expect(await (await load()).hasGpuAcceleration()).toBe(false);
  });

  it('probes once', async () => {
    electron.getGPUFeatureStatus.mockReturnValue(status('enabled', 'enabled'));
    const { hasGpuAcceleration } = await load();

    await hasGpuAcceleration();
    await hasGpuAcceleration();

    expect(electron.windows).toHaveBeenCalledOnce();
  });

  it('takes a probe that fails for a GPU, and still closes the window', async () => {
    electron.loadURL.mockRejectedValue(new Error('the page did not load'));

    expect(await (await load()).hasGpuAcceleration()).toBe(true);
    expect(electron.destroy).toHaveBeenCalledOnce();
  });

  it('is forced off by TUNELLE_GPU=0', async () => {
    vi.stubEnv('TUNELLE_GPU', '0');
    electron.getGPUFeatureStatus.mockReturnValue(status('enabled', 'enabled'));

    expect(await (await load()).hasGpuAcceleration()).toBe(false);
  });

  it('is forced on by TUNELLE_GPU=1', async () => {
    vi.stubEnv('TUNELLE_GPU', '1');
    electron.getGPUFeatureStatus.mockReturnValue(status('disabled_software', 'disabled_software'));

    expect(await (await load()).hasGpuAcceleration()).toBe(true);
  });
});
