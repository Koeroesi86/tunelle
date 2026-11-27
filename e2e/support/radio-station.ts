import type { IncomingMessage, ServerResponse } from 'http';
import { startDirectory } from '../../scripts/screenshots/screenshot-fixtures';
import { writeFlac } from '../../scripts/screenshots/screenshot-media';

const seconds = 60;
/** Sent at once, so playback starts promptly; the rest follows in real time */
const burstSeconds = 3;

/**
 * A station directory whose stations stream a sine, of another pitch on each connection (the last one stays), so what is heard says which connection plays.
 * `drop` breaks the open connections, `stall` keeps them open and sends nothing more
 */
export const startToneStations = async (frequencies: number[]) => {
  const files = frequencies.map((frequency) => writeFlac({ seconds, frequency, cover: Buffer.alloc(0), tags: {} }));
  const open = new Map<ServerResponse, NodeJS.Timeout>();
  let connections = 0;

  const station = (_request: IncomingMessage, response: ServerResponse) => {
    const file = files[Math.min(connections, files.length - 1)];
    const second = Math.ceil(file.length / seconds);
    let sent = second * burstSeconds;
    connections += 1;
    response.writeHead(200, { 'content-type': 'audio/flac' });
    response.write(file.subarray(0, sent));
    const pace = setInterval(() => {
      response.write(file.subarray(sent, sent + second));
      sent += second;
    }, 1000);
    open.set(response, pace);
    response.on('close', () => clearInterval(pace));
  };

  return {
    ...(await startDirectory(station)),
    drop: () => open.forEach((_, response) => response.destroy()),
    stall: () => open.forEach((pace) => clearInterval(pace)),
  };
};
