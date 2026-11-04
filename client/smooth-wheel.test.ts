import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachSmoothWheel } from './smooth-wheel';

describe('attachSmoothWheel', () => {
  let element: HTMLDivElement;
  let detach: () => void;

  const wheel = (init: WheelEventInit, timeStamp = 1000) => {
    const event = new WheelEvent('wheel', { cancelable: true, bubbles: true, ...init });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    element.dispatchEvent(event);
    return event;
  };
  const frames = (count: number) => vi.advanceTimersByTime(count * 16.7);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    element = document.createElement('div');
    Object.defineProperty(element, 'scrollHeight', { value: 5000 });
    Object.defineProperty(element, 'clientHeight', { value: 500 });
    document.body.append(element);
    detach = attachSmoothWheel(element);
  });

  afterEach(() => {
    detach();
    element.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('glides to the place of a notch instead of jumping, and ends exactly there', () => {
    const event = wheel({ deltaY: 100 });
    expect(event.defaultPrevented).toBe(true);
    expect(element.scrollTop).toBe(0);

    frames(2);
    expect(element.scrollTop).toBeGreaterThan(0);
    expect(element.scrollTop).toBeLessThan(100);

    frames(60);
    expect(element.scrollTop).toBe(100);
  });

  it('adds a next notch to the glide that is running', () => {
    wheel({ deltaY: 100 });
    frames(3);
    wheel({ deltaY: 100 }, 1050);
    frames(80);

    expect(element.scrollTop).toBe(200);
  });

  it('stays inside the list', () => {
    wheel({ deltaY: -100 });
    frames(60);
    expect(element.scrollTop).toBe(0);

    wheel({ deltaY: 99999 });
    frames(200);
    expect(element.scrollTop).toBe(4500);
  });

  it('leaves a touchpad, the zoom, a sideways scroll and the lines of a wheel that is not a notch to the browser', () => {
    expect(wheel({ deltaY: 4 }, 1000).defaultPrevented).toBe(false);
    // right after a touchpad event, a larger one is a flick of it
    expect(wheel({ deltaY: 120 }, 1100).defaultPrevented).toBe(false);
    expect(wheel({ deltaY: 120, ctrlKey: true }, 2000).defaultPrevented).toBe(false);
    expect(wheel({ deltaY: 120, deltaX: 10 }, 2100).defaultPrevented).toBe(false);
    expect(wheel({ deltaY: 100.5 }, 2200).defaultPrevented).toBe(false);
  });

  it('takes a wheel that scrolls by lines as notches too', () => {
    wheel({ deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE }, 5000);
    frames(60);

    expect(element.scrollTop).toBe(120);
  });

  it('does not glide for a user who asked for less motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));

    expect(wheel({ deltaY: 100 }, 6000).defaultPrevented).toBe(false);
  });

  it('gives way when the list is moved by something else meanwhile', () => {
    wheel({ deltaY: 400 });
    frames(2);
    element.scrollTop = 3000;
    frames(60);

    expect(element.scrollTop).toBe(3000);
  });

  it('stops listening when it is taken off', () => {
    detach();

    expect(wheel({ deltaY: 100 }, 7000).defaultPrevented).toBe(false);
  });
});
