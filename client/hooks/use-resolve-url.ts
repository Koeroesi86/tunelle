import { createContext, useContext } from 'react';

/** Makes the address of what the main process serves (a route such as `/albumart/a.png`) one that the page can load; the app gives it the origin, a component without one shows the route */
export const ResolveUrl = createContext<(route: string) => string>((route) => route);

export const useResolveUrl = () => useContext(ResolveUrl);
