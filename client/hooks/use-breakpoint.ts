import { useEffect, useState } from 'react';
import { getBreakpoint } from '../constants/breakpoints';

/** The size class of the window, which changes only when the window crosses a breakpoint (a resize inside one renders nothing) */
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState(() => getBreakpoint(window.innerWidth));

  useEffect(() => {
    const update = () => setBreakpoint(getBreakpoint(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return breakpoint;
}
