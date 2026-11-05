interface FetchOkOptions {
  headers?: Record<string, string>;
  /** Gives up after this many milliseconds */
  timeout?: number;
  /** Gives up when this signal aborts */
  cancel?: AbortSignal;
}

/** `fetch` that throws on a status outside 200-299, with an optional timeout and cancel signal */
export const fetchOk = async (url: string, { headers, timeout, cancel }: FetchOkOptions = {}) => {
  const signals = [...(timeout === undefined ? [] : [AbortSignal.timeout(timeout)]), ...(cancel ? [cancel] : [])];
  const response = await fetch(url, { headers, signal: signals.length ? AbortSignal.any(signals) : undefined });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);

  return response;
};
