import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ getGPUFeatureStatus: vi.fn() }));
const send = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({ app: { getGPUFeatureStatus: electron.getGPUFeatureStatus } }));
vi.mock('../utils/send-if-alive', () => ({ sendIfAlive: send }));

const status = (gpu_compositing: string, canvas: string) => ({ gpu_compositing, '2d_canvas': canvas });

const load = async () => {
  vi.resetModules();

  return import('./gpu-acceleration');
};

const windowOf = () => ({ setVibrancy: vi.fn(), setBackgroundMaterial: vi.fn(), webContents: { id: 1 } }) as unknown as import('electron').BrowserWindow;

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

describe('detectSoftwareRendering', () => {
  const platform = (name: NodeJS.Platform) => vi.spyOn(process, 'platform', 'get').mockReturnValue(name);

  beforeEach(() => {
    send.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('leaves the window and the page alone with a GPU', async () => {
    electron.getGPUFeatureStatus.mockReturnValue(status('enabled', 'enabled'));
    platform('darwin');
    const window = windowOf();
    const gpu = await load();

    gpu.detectSoftwareRendering(window);

    expect(gpu.isSoftwareRendering()).toBe(false);
    expect(window.setVibrancy).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('drops the vibrancy of macOS and tells the page without a GPU', async () => {
    electron.getGPUFeatureStatus.mockReturnValue(status('disabled_software', 'disabled_software'));
    platform('darwin');
    const window = windowOf();
    const gpu = await load();

    gpu.detectSoftwareRendering(window);

    expect(gpu.isSoftwareRendering()).toBe(true);
    expect(window.setVibrancy).toHaveBeenCalledWith(null);
    expect(send).toHaveBeenCalledWith(window.webContents, 'SOFTWARE_RENDERING', { software: true });
  });

  it('drops the acrylic of Windows without a GPU', async () => {
    electron.getGPUFeatureStatus.mockReturnValue(status('disabled_software', 'disabled_software'));
    platform('win32');
    const window = windowOf();

    (await load()).detectSoftwareRendering(window);

    expect(window.setBackgroundMaterial).toHaveBeenCalledWith('none');
    expect(window.setVibrancy).not.toHaveBeenCalled();
  });

  it('is forced on by TUNELLE_GPU=0 and off by TUNELLE_GPU=1', async () => {
    electron.getGPUFeatureStatus.mockReturnValue(status('enabled', 'enabled'));
    vi.stubEnv('TUNELLE_GPU', '0');
    const gpu = await load();
    gpu.detectSoftwareRendering(windowOf());
    expect(gpu.isSoftwareRendering()).toBe(true);

    electron.getGPUFeatureStatus.mockReturnValue(status('disabled_software', 'disabled_software'));
    vi.stubEnv('TUNELLE_GPU', '1');
    gpu.detectSoftwareRendering(windowOf());
    expect(gpu.isSoftwareRendering()).toBe(false);
  });

  it('tells a page that asks later what was found', async () => {
    electron.getGPUFeatureStatus.mockReturnValue(status('disabled_software', 'disabled_software'));
    const gpu = await load();
    gpu.detectSoftwareRendering(windowOf());
    const sender = { id: 2 } as unknown as import('electron').WebContents;

    gpu.sendSoftwareRendering(sender);

    expect(send).toHaveBeenLastCalledWith(sender, 'SOFTWARE_RENDERING', { software: true });
  });
});
