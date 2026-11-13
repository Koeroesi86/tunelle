import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { useAudioListener } from './use-audio-listener';
import { useDelayedValue } from './use-delayed-value';
import { useScrollSeparator } from './use-scroll-separator';
import { useUpdateEffect } from './use-update-effect';

describe('hooks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs an update effect for changes only, not for the first render', () => {
    const effect = vi.fn();
    const { rerender } = renderHook(({ value }) => useUpdateEffect(effect, [value]), { initialProps: { value: 1 } });
    expect(effect).not.toHaveBeenCalled();

    rerender({ value: 1 });
    expect(effect).not.toHaveBeenCalled();

    rerender({ value: 2 });
    expect(effect).toHaveBeenCalledOnce();
  });

  it('registers an audio listener once and calls the latest callback', () => {
    const register = vi.fn();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ callback }) => useAudioListener(register, callback), { initialProps: { callback: first } });
    rerender({ callback: second });

    register.mock.calls[0][0](true);

    expect(register).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(true);
  });

  it('follows a value after the delay, the latest one only', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDelayedValue(value, 10), { initialProps: { value: 'a' } });
    rerender({ value: 'b' });
    rerender({ value: 'c' });
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(10));

    expect(result.current).toBe('c');
  });

  it('marks the separator while the listing is scrolled down', () => {
    vi.useFakeTimers();
    const Listing = () => {
      const { separator, listing } = useScrollSeparator('scrolled');
      return (
        <div>
          <div data-testid="separator" ref={separator} />
          <div data-testid="listing" ref={listing} />
        </div>
      );
    };
    const { getByTestId } = render(<Listing />);
    const scroll = (scrollTop: number) => {
      getByTestId('listing').scrollTop = scrollTop;
      fireEvent.scroll(getByTestId('listing'));
      act(() => vi.advanceTimersByTime(50));
    };

    scroll(30);
    expect(getByTestId('separator').classList.contains('scrolled')).toBe(true);

    scroll(0);
    expect(getByTestId('separator').classList.contains('scrolled')).toBe(false);
  });
});
