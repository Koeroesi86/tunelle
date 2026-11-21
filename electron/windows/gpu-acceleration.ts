import { app, type GPUFeatureStatus } from 'electron';
import { gpuOverrideSchema } from '../schemas/environment';

const isOn = (status: string) => status.startsWith('enabled');

/** Whether Chromium composites the window and draws its canvases on the GPU, and not in software (a machine with no GPU, a driver on the blocklist, `--disable-gpu`) */
export const isAccelerated = (status: Pick<GPUFeatureStatus, 'gpu_compositing' | '2d_canvas'>) => isOn(status.gpu_compositing) && isOn(status['2d_canvas']);

/** `TUNELLE_GPU=0` or `1` forces the answer, to try the software mode on a machine with a GPU. See docs/app/software-rendering.md */
export const hasGpuAcceleration = () => gpuOverrideSchema.parse(process.env.TUNELLE_GPU) ?? isAccelerated(app.getGPUFeatureStatus());
