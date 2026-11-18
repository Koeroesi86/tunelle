import { describe, expect, it } from 'vitest';
import { provideRemoteMedia, serveRemoteAudio, serveRemoteCover } from './remote-media';

describe('the audio and the cover of the host this app listens to', () => {
  const request = new Request('tunelle://app/remote/audio');

  it('are 404 until the listener provides them, then the answers of the listener', async () => {
    expect((await serveRemoteAudio(request)).status).toBe(404);
    expect((await serveRemoteCover(request)).status).toBe(404);

    provideRemoteMedia({ audio: async () => new Response('audio', { status: 206 }), cover: async () => new Response('png', { status: 200 }) });

    expect((await serveRemoteAudio(request)).status).toBe(206);
    expect((await serveRemoteCover(request)).status).toBe(200);
  });
});
