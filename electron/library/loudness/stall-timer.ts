/** Calls `onStall` when `touch` is not called for `ms`: the time that counts is the time without progress, not the time a job takes in all */
export const createStallTimer = (ms: number, onStall: () => void) => {
  let timer = setTimeout(onStall, ms);

  return {
    touch: () => {
      clearTimeout(timer);
      timer = setTimeout(onStall, ms);
    },
    stop: () => clearTimeout(timer),
  };
};
