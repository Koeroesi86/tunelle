import { execFile } from 'child_process';
import { z } from 'zod';
import { logError } from '../utils/log-error';
import { ffmpegProgram } from './ffmpeg-program';

const probeSchema = z.object({
  streams: z.array(z.object({ sample_rate: z.string(), channels: z.number(), time_base: z.string(), duration_ts: z.number() })).min(1),
});

interface AudioLength {
  channels: number;
  sampleRate: number;
  frames: number;
}

/**
 * The channels, the rate and the exact number of frames of the first audio stream, or undefined when they are not exact: a stream whose time base is not
 * one frame has a length that is only as precise as its timestamps. See docs/app/decoder-proxy.md
 */
export const probeAudio = (source: string) =>
  new Promise<AudioLength | undefined>((resolve) => {
    execFile(
      ffmpegProgram('ffprobe'),
      ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels,time_base,duration_ts', '-of', 'json', source],
      { windowsHide: true, timeout: 20000 },
      (error, stdout) => {
        if (error) {
          logError(error);
          resolve(undefined);
          return;
        }
        const parsed = probeSchema.safeParse(safeJson(stdout));
        const stream = parsed.success ? parsed.data.streams[0] : undefined;
        const sampleRate = Number(stream?.sample_rate);
        resolve(
          stream && stream.time_base === `1/${sampleRate}` && stream.duration_ts > 0
            ? { channels: stream.channels, sampleRate, frames: stream.duration_ts }
            : undefined
        );
      }
    );
  });

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
