import { execFile } from 'child_process';
import { z } from 'zod';
import { logError } from '../utils/log-error';
import { ffmpegProgram } from './ffmpeg-program';
import { toProbedFormat } from '../utils/codec-name';

const probeSchema = z.object({
  streams: z
    .array(z.object({ codec_name: z.string(), sample_rate: z.string(), channels: z.number(), time_base: z.string(), duration_ts: z.number().optional() }))
    .min(1),
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
 * The channels, the rate and the exact number of frames of the first audio stream: false when they are not exact (a time base that is not one frame, or
 * ALAC in CAF, which says more frames than it has), undefined when ffprobe gave no answer. See docs/app/decoder-windowed.md
 */
export const probeAudio = async (source: string): Promise<AudioLength | false | undefined> => {
  const found = await probe(source, 'stream=codec_name,sample_rate,channels,time_base,duration_ts:format=format_name', probeSchema);
  if (!found) return undefined;
  const [{ codec_name: codec, sample_rate: rate, channels, time_base: timeBase, duration_ts: frames = 0 }] = found.streams;
  const sampleRate = Number(rate);
  const exact = timeBase === `1/${sampleRate}` && frames > 0 && !(codec === 'alac' && found.format.format_name === 'caf');
  return exact && { channels, sampleRate, frames };
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
