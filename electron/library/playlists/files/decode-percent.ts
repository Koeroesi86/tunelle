const decodeRun = (run: string) => {
  try {
    return decodeURIComponent(run);
  } catch {
    return run;
  }
};

/** The text with its percent sequences decoded; a `%` that starts none, or bytes that are no UTF-8, stay as they are, as a file can be named like that */
export const decodePercent = (text: string) => text.replace(/(%[0-9a-f]{2})+/gi, decodeRun);
