import { app, BrowserWindow, type GPUFeatureStatus } from 'electron';
import { gpuOverrideSchema } from '../schemas/environment';

const isOn = (status: string) => status.startsWith('enabled');

/** Whether Chromium composites the window and draws its canvases on the GPU, and not in software (a machine with no GPU, a driver on the blocklist, `--disable-gpu`) */
export const isAccelerated = (status: Pick<GPUFeatureStatus, 'gpu_compositing' | '2d_canvas'>) => isOn(status.gpu_compositing) && isOn(status['2d_canvas']);

/** The status says software until a page was drawn, as the GPU process starts with the first one: a hidden window shows one, and the window of the app opens on a GPU process that runs already. See docs/app/software-rendering.md */
const probe = async () => {
  // Electron quits when the last window closes and nothing listens (the app registers its own listener when it has started)
  app.on('window-all-closed', () => undefined);
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await window.loadURL('data:text/html,<body>Tunelle</body>');
    return isAccelerated(app.getGPUFeatureStatus());
  } finally {
    window.destroy();
  }
};

let probed: Promise<boolean> | undefined;

/** `TUNELLE_GPU=0` or `1` forces the answer, to try the software mode on a machine with a GPU. A probe that fails is a GPU, as the app does not take its motion away on a guess */
export const hasGpuAcceleration = async () => {
  probed ??= probe().catch(() => true);

  return gpuOverrideSchema.parse(process.env.TUNELLE_GPU) ?? probed;
};
