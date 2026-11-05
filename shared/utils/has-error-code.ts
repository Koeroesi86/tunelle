/** Whether the error is a system error (ENOENT, EEXIST) with one of the codes */
export const hasErrorCode = (error: unknown, ...codes: string[]) =>
  error instanceof Error && 'code' in error && typeof error.code === 'string' && codes.includes(error.code);
