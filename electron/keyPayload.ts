import { isRecord } from '../shared/utils/is-record';

const maxFieldLength = 2000;

const isField = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= maxFieldLength;

/** The key of a renderer message, anything but plain text fields is dropped */
export const toKey = (payload: unknown) => {
  const { source, kind, id } = isRecord(payload) ? payload : {};

  return isField(source) && isField(kind) && isField(id) ? { source, kind, id } : undefined;
};
