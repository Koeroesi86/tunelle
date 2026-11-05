import { contextBridge, ipcRenderer } from 'electron';
import type { MeasureRequest, MeasureResult } from '@shared/types/loudness';

contextBridge.exposeInMainWorld('loudnessAPI', {
  onMeasure: (listener: (request: MeasureRequest) => void) => ipcRenderer.on('LOUDNESS_MEASURE', (_event, request: MeasureRequest) => listener(request)),
  report: (result: MeasureResult) => ipcRenderer.send('LOUDNESS_RESULT', result),
  ready: () => ipcRenderer.send('LOUDNESS_READY'),
});
