/** Stylesheets are irrelevant for unit tests: expose every class name as itself */
export default new Proxy<Record<string, string>>(
  {},
  {
    get: (_, key) => (typeof key === 'string' && key !== '__esModule' && key !== 'then' ? key : undefined),
  }
);
