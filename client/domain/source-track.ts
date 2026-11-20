import { sourcePathSchema } from '@shared/schemas/sources';

/** Whether a track is one of a server of the user (`subsonic:<serverId>:<id>`), which plays through the local protocol */
export const isSourcePath = (path: string) => sourcePathSchema.safeParse(path).success;
