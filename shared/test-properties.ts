/** The same cases on every run, so a failure of CI shows again; other cases with `PROPERTY_SEED` and `PROPERTY_RUNS`. See docs/development/property-tests.md */
export const propertyParameters = {
  seed: Number(process.env.PROPERTY_SEED ?? 597),
  numRuns: Number(process.env.PROPERTY_RUNS ?? 300),
};
