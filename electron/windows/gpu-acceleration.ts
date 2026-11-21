import { app, type BrowserWindow, type GPUFeatureStatus, type WebContents } from 'electron';
import { gpuOverrideSchema } from '../schemas/environment';
import { sendIfAlive } from '../utils/send-if-alive';

const isOn = (status: string) => status.startsWith('enabled');

/** Whether Chromium composites the window and draws its canvases on the GPU, and not in software (a machine with no GPU, a driver on the blocklist, `--disable-gpu`) */
export const isAccelerated = (status: Pick<GPUFeatureStatus, 'gpu_compositing' | '2d_canvas'>) => isOn(status.gpu_compositing) && isOn(status['2d_canvas']);

let software = false;

export const isSoftwareRendering = () => software;

/** Tells the page whether nothing is drawn by a GPU, which it does not know until the window has loaded (see detectSoftwareRendering) */
export const sendSoftwareRendering = (sender: WebContents) => sendIfAlive(sender, 'SOFTWARE_RENDERING', { software });

/** Asks the GPU status once the page of the window has loaded (it says software before) and takes from the window what the compositor pays for. See docs/app/software-rendering.md */
export const detectSoftwareRendering = (window: BrowserWindow) => {
  software = !(gpuOverrideSchema.parse(process.env.TUNELLE_GPU) ?? isAccelerated(app.getGPUFeatureStatus()));
  if (!software) return;

  if (process.platform === 'darwin') window.setVibrancy(null);
  if (process.platform === 'win32') window.setBackgroundMaterial('none');
  sendSoftwareRendering(window.webContents);
};
