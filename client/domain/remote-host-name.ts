import type { RemoteListenerState } from '@shared/schemas/remote-listener';
import type { NearbyHost } from '@shared/schemas/remote-nearby';

/** The name the host announces, or its address while it is not among the Tunelles nearby; undefined while this app does not listen */
export const hostNameOf = ({ remoteListener, remoteNearby }: { remoteListener: RemoteListenerState | undefined; remoteNearby: NearbyHost[] }) => {
  const target = remoteListener?.status === 'listening' ? remoteListener.target : undefined;
  return target && (remoteNearby.find(({ host, port }) => host === target.host && port === target.port)?.name ?? `${target.host}:${target.port}`);
};
