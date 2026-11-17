let relay: ((request: Request) => Promise<Response>) | undefined;

/** The listener tells the protocol where the audio of its host comes from; the page names no host, so it reaches the one that approved this app */
export const provideRemoteAudio = (serve: (request: Request) => Promise<Response>) => {
  relay = serve;
};

export const serveRemoteAudio = (request: Request) => (relay ? relay(request) : Promise.resolve(new Response(undefined, { status: 404 })));
