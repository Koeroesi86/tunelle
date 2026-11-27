import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import type { WebContents } from 'electron';
import type { Track } from '@shared/types/library';
import { createTrackReader } from '../reading/track-reader';
import isSupported, { isSupportedCodec } from '../../utils/is-supported';
import { sendIfAlive } from '../../utils/send-if-alive';
import { logError } from '../../utils/log-error';

const readTimeout = 30_000;

/** The files the system opened, which are not in the library: the player serves them from here. See docs/app/open-files.md */
const openedTracks = new Map<string, Track>();
let pending: Track[] = [];
let target: WebContents | undefined;

const toPath = (argument: string, workingDirectory: string) => {
  if (!argument.startsWith('file:')) return path.resolve(workingDirectory, argument);

  try {
    return fileURLToPath(argument);
  } catch {
    return undefined;
  }
};

/** The audio files among the arguments of a start: a path, or the `file:` address that the `%U` of a desktop entry passes; an option or a file that does not play is left out */
export const findOpenableFiles = (args: string[], workingDirectory: string) => [
  ...new Set(
    args
      .filter((argument) => !argument.startsWith('-'))
      .map((argument) => toPath(argument, workingDirectory))
      .filter((file): file is string => file !== undefined && isSupported(file))
  ),
];

export const findOpenedTrack = (trackPath: string) => openedTracks.get(trackPath);

const flush = () => {
  if (!target || pending.length === 0) return;

  sendIfAlive(target, 'OPENED_FILES', { tracks: pending });
  pending = [];
};

/** The page is ready for the files that were opened before it was, and for the ones that come later */
export const attachOpenedFiles = (sender: WebContents) => {
  target = sender;
  flush();
};

/** The page is gone: files wait for the one that is loaded in its place */
export const detachOpenedFiles = () => {
  target = undefined;
};

/** Reads the files and hands them to the page, which plays them; a file that does not read stays out */
export const openFiles = async (args: string[], workingDirectory: string) => {
  const files = findOpenableFiles(args, workingDirectory);
  if (files.length === 0) return;

  await app.whenReady();
  const reader = createTrackReader();
  const tracks = await Promise.all(files.map((file) => reader.read(file, global._appDataPath, readTimeout).catch((error: unknown) => logError(error))))
    .then((read) => read.flatMap((track) => (track && isSupportedCodec(track.codec) ? [track] : [])))
    .finally(reader.close);

  tracks.forEach((track) => openedTracks.set(track.path, track));
  pending = [...pending, ...tracks];
  flush();
};
