import { execFile } from 'child_process';
import { z } from 'zod';
import { logError } from '../utils/log-error';
import { ffmpegProgram } from './ffmpeg-program';
import { toProbedFormat } from '../utils/codec-name';

const probeSchema = z.object({
  streams: z.array(z.object({ codec_name: z.string(), sample_rate: z.string(), channels: z.number(), time_base: z.string(), duration_ts: z.number() })).min(1),
  format: z.object({ format_name: z.string() }),
});

interface AudioLength {
  channels: number;
  sampleRate: number;
  frames: number;
}

const formatSchema = z.object({
  streams: z
    .array(
      z.object({
        codec_name: z.string(),
        sample_fmt: z.string().optional(),
        bits_per_sample: z.coerce.number().optional().catch(undefined),
        bits_per_raw_sample: z.coerce.number().optional().catch(undefined),
      })
    )
    .min(1),
  format: z.object({ format_name: z.string() }),
});

/** What ffprobe says of the first audio stream, in the shape of the schema; undefined when it fails or says something else */
const probe = <Schema extends z.ZodType>(source: string, entries: string, schema: Schema) =>
  new Promise<z.output<Schema> | undefined>((resolve) => {
    execFile(
      ffmpegProgram('ffprobe'),
      ['-v', 'error', '-select_streams', 'a:0', '-show_entries', entries, '-of', 'json', source],
      { windowsHide: true, timeout: 20000 },
      (error, stdout) => {
        if (error) logError(error);
        resolve(error ? undefined : schema.safeParse(safeJson(stdout)).data);
      }
    );
  });

/**
 * The channels, the rate and the exact number of frames of the first audio stream, or undefined when they are not exact: a stream whose time base is not
 * one frame has a length that is only as precise as its timestamps, and ALAC in CAF says more frames than it has. See docs/app/decoder-proxy.md
 */
export const probeAudio = async (source: string): Promise<AudioLength | undefined> => {
  const found = await probe(source, 'stream=codec_name,sample_rate,channels,time_base,duration_ts:format=format_name', probeSchema);
  if (!found || (found.streams[0].codec_name === 'alac' && found.format.format_name === 'caf')) return undefined;
  const [stream] = found.streams;
  const sampleRate = Number(stream.sample_rate);
  return stream.time_base === `1/${sampleRate}` && stream.duration_ts > 0 ? { channels: stream.channels, sampleRate, frames: stream.duration_ts } : undefined;
};

/** The codec and the depth of the first audio stream as the library names them, and whether its samples are float */
export const probeFormat = async (source: string) => {
  const found = await probe(source, 'stream=codec_name,sample_fmt,bits_per_sample,bits_per_raw_sample:format=format_name', formatSchema);
  if (!found) return undefined;
  const [{ codec_name: codec, sample_fmt: sampleFormat = '', bits_per_sample: stored, bits_per_raw_sample: raw }] = found.streams;
  const format = toProbedFormat({ codec, container: found.format.format_name, sampleFormat, bits: raw || stored || null });
  return { ...format, float: /^(flt|dbl)/.test(sampleFormat) };
};

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
