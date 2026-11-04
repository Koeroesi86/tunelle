/** Share of the way to the target that a frame of 1/60 s covers: the glide of a notch takes a quarter of a second */
const easing = 0.2;

/** Pixels a line of a wheel that scrolls by lines moves */
const lineHeight = 40;

/** Wheel events smaller than this, or with a fraction, are a touchpad, which glides by itself; a notch of a wheel is 100 px or more */
const notch = 50;

/** How long after a touchpad event the wheel is left alone, as its events come in streams */
const touchpadPause = 500;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const pixelsOf = (event: WheelEvent, element: HTMLElement) => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * lineHeight;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * element.clientHeight;
  return event.deltaY;
};

/**
 * Makes the notches of a mouse wheel glide to their place instead of jumping: the scroll is a short eased animation that a next notch extends.
 * A touchpad, the zoom, a sideways scroll, the scrollbar and the keys keep their own scrolling, and so does a user who asked for less motion.
 * Returns the function that takes it off.
 */
export const attachSmoothWheel = (element: HTMLElement) => {
  let frame = 0;
  let target = 0;
  let shown = 0;
  let last = 0;
  let touchpadAt = -Infinity;

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  const step = (now: number) => {
    // the scrollbar or a key moved the list meanwhile: that scroll wins
    if (Math.abs(element.scrollTop - shown) > 1.5) return stop();

    const distance = target - shown;
    // the first frame of a glide counts as one of 1/60 s, a slow frame as at most three
    const elapsed = last ? Math.min(now - last, 50) : 1000 / 60;
    const covered = 1 - (1 - easing) ** (elapsed / (1000 / 60));
    last = now;
    // at least a pixel a frame, as the browser may round the position and a smaller step would stand still
    shown = Math.abs(distance) <= 1 ? target : shown + Math.sign(distance) * Math.max(Math.abs(distance) * covered, 1);
    element.scrollTop = shown;
    // the browser keeps what it can show, so the end of the list is the new position
    shown = element.scrollTop;

    frame = shown === target ? 0 : requestAnimationFrame(step);
  };

  const onWheel = (event: WheelEvent) => {
    const pixels = pixelsOf(event, element);
    const isNotch = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || (Number.isInteger(pixels) && Math.abs(pixels) >= notch);
    if (!isNotch) touchpadAt = event.timeStamp;
    if (!isNotch || event.timeStamp - touchpadAt < touchpadPause) return;
    if (event.defaultPrevented || event.ctrlKey || event.shiftKey || event.deltaX !== 0 || prefersReducedMotion()) return;

    event.preventDefault();
    const farthest = element.scrollHeight - element.clientHeight;
    if (!frame) {
      shown = element.scrollTop;
      target = shown;
      last = 0;
    }
    target = Math.min(Math.max(target + pixels, 0), farthest);
    if (!frame) frame = requestAnimationFrame(step);
  };

  element.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    stop();
    element.removeEventListener('wheel', onWheel);
  };
};
