import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBreakpoint } from './use-breakpoint';

const resizeTo = (width: number) => {
  vi.stubGlobal('innerWidth', width);
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
};

describe('useBreakpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with the size of the window', () => {
    vi.stubGlobal('innerWidth', 800);
    expect(renderHook(() => useBreakpoint()).result.current).toBe('medium');
  });

  it('follows the window across the breakpoints', () => {
    vi.stubGlobal('innerWidth', 1400);
    const { result } = renderHook(() => useBreakpoint());

    resizeTo(500);
    expect(result.current).toBe('compact');
    resizeTo(1000);
    expect(result.current).toBe('medium');
  });

  it('renders again only when a breakpoint is crossed', () => {
    vi.stubGlobal('innerWidth', 700);
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useBreakpoint();
    });
    const before = renders;

    resizeTo(900);
    resizeTo(650);

    expect(renders).toBe(before);
  });

  it('stops listening when it unmounts', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    renderHook(() => useBreakpoint()).unmount();

    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
