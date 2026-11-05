/** A wait is a setTimeout promise, so fake timers cover it (timers/promises they do not) */
export const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
