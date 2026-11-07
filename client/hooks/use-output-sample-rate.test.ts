import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useOutputSampleRate } from './use-output-sample-rate';

describe('useOutputSampleRate', () => {
  it('gives the rate of the output and follows it when the output changes', () => {
    let rate = 48000;
    const listeners = new Set<() => void>();
    const { result, unmount } = renderHook(() =>
      useOutputSampleRate({
        getSampleRate: () => rate,
        addOutputChangeListener: (listener) => listeners.add(listener),
        removeOutputChangeListener: (listener) => listeners.delete(listener),
      })
    );
    expect(result.current).toBe(48000);

    rate = 96000;
    act(() => listeners.forEach((listener) => listener()));
    expect(result.current).toBe(96000);

    unmount();
    expect(listeners.size).toBe(0);
  });
});
