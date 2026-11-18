import { describe, expect, it } from 'vitest';
import { provideRemoteAudio, serveRemoteAudio } from './remote-audio';

describe('the audio of the host this app listens to', () => {
  const request = new Request('tunelle://app/remote/audio');

  it('is 404 until the listener provides it, then the answer of the listener', async () => {
    expect((await serveRemoteAudio(request)).status).toBe(404);

    provideRemoteAudio(async () => new Response('audio', { status: 206 }));

    expect((await serveRemoteAudio(request)).status).toBe(206);
  });
});
