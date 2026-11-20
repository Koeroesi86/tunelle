import { join } from 'path';
import { app } from 'electron';

/** The bundled `ffmpeg` or `ffprobe`: in the resources of the packaged app, in `.cache/ffmpeg` (`npm run ffmpeg`) next to `out/` otherwise. See docs/development/ffmpeg-build.md */
export const ffmpegProgram = (name: 'ffmpeg' | 'ffprobe' = 'ffmpeg') =>
  join(
    app.isPackaged ? join(process.resourcesPath, 'ffmpeg') : join(app.getAppPath(), '..', '.cache', 'ffmpeg', 'install', 'bin'),
    process.platform === 'win32' ? `${name}.exe` : name
  );
