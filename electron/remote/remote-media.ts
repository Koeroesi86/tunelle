import type { RouteRequest } from '../protocols/request-aborts';

type Relay = (request: RouteRequest) => Promise<Response>;

let audio: Relay | undefined;
let cover: Relay | undefined;

/** The listener tells the protocol where the audio and the cover of its host come from; the page names no host, so it reaches the one that approved this app */
export const provideRemoteMedia = (relays: { audio: Relay; cover: Relay }) => {
  audio = relays.audio;
  cover = relays.cover;
};

const serve = (relay: Relay | undefined, request: RouteRequest) => (relay ? relay(request) : Promise.resolve(new Response(undefined, { status: 404 })));

export const serveRemoteAudio = (request: RouteRequest) => serve(audio, request);

export const serveRemoteCover = (request: RouteRequest) => serve(cover, request);
