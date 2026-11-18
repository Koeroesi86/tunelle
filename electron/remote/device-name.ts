import { MAX_NAME_LENGTH, plain } from './access';

/** The name this computer gives when it asks to listen: the host refuses an empty one or one over the limit, and a host name can be both */
export const deviceNameOf = (hostName: string) => plain(hostName).slice(0, MAX_NAME_LENGTH).trim() || 'Tunelle';
