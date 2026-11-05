export type JsonRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null;
