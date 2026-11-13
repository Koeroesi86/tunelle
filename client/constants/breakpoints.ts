/** The widths of the window the layout changes at, in px; client/styles/breakpoints.scss holds the same numbers. See docs/development/responsive-layout.md */
export const breakpoints = { mediumMin: 600, expandedMin: 1024 } as const;

export type Breakpoint = 'compact' | 'medium' | 'expanded';

export const getBreakpoint = (width: number): Breakpoint => {
  if (width < breakpoints.mediumMin) return 'compact';
  return width < breakpoints.expandedMin ? 'medium' : 'expanded';
};
