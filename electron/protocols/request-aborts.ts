import { session } from 'electron';

// `request.signal` of `protocol.handle` never aborts, so the end of a request is taken from `webRequest`. See docs/app/tunelle-protocol.md
const idHeader = 'x-tunelle-request';
const running = new Map<string, AbortController>();

/** What a route reads of a request. Not a `new Request` with another signal, which loses the abort once it is collected */
export type RouteRequest = Pick<Request, 'url' | 'headers' | 'signal'>;

/** Tags every request with its id and aborts the signal of the id when the request fails, which is how a page that lets it go is reported */
export const watchRequestAborts = (urls: string[]) => {
  const { webRequest } = session.defaultSession;

  webRequest.onBeforeSendHeaders({ urls }, ({ id, requestHeaders }, callback) => {
    running.set(String(id), new AbortController());
    callback({ requestHeaders: { ...requestHeaders, [idHeader]: String(id) } });
  });
  webRequest.onErrorOccurred({ urls }, ({ id }) => {
    running.get(String(id))?.abort();
    running.delete(String(id));
  });
  webRequest.onCompleted({ urls }, ({ id }) => void running.delete(String(id)));
};

/** Aborts when the page lets the request go, from the start when it has ended already; a request without a tag keeps its own signal */
export const abortSignalOf = (request: Request) => {
  const id = request.headers.get(idHeader);
  if (id === null) return request.signal;

  return running.get(id)?.signal ?? AbortSignal.abort();
};
