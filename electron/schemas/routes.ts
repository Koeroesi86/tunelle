import { z } from 'zod';
import { stationUuid } from '../constants/radio';

// what the page puts in the address of a request to the tunelle:// protocol (docs/app/tunelle-protocol.md)

export const trackPathSchema = z.string().min(1);

/** The key of the art that was found for the title of a stream */
export const artKeySchema = z.string().regex(/^[0-9a-f]{16}$/);

export const stationUuidSchema = z.string().regex(stationUuid);

/** The asset of a path like `/albumart/<name>`: what it is, and its name */
export const assetPathSchema = z
  .string()
  .regex(/^\/(albumart|radio-art|radio-logo|radio)\/[^/]+$/)
  .transform((pathname) => {
    const [, kind, name] = pathname.split('/');
    return { kind, key: decodeURIComponent(name) };
  });
