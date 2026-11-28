import { describe, expect, it } from 'vitest';
import { createLeadMeter, defaultLead, liveEdgeTarget, msUntilHandoff } from './gapless';

describe('createLeadMeter', () => {
  it('starts with the default lead until a start has been measured', () => {
    expect(createLeadMeter().lead()).toBe(defaultLead);
  });

  it('leads by the median of the last starts, so one slow start does not move it', () => {
    const meter = createLeadMeter();
    [0.3, 0.04, 0.05].forEach(meter.record);

    expect(meter.lead()).toBe(0.05);
  });

  it('forgets the starts before the last five', () => {
    const meter = createLeadMeter();
    [0.4, 0.4, 0.02, 0.02, 0.02, 0.02, 0.02].forEach(meter.record);

    expect(meter.lead()).toBe(0.02);
  });

  it('keeps five starts', () => {
    const meter = createLeadMeter();
    [0.02, 0.4, 0.4, 0.02, 0.02].forEach(meter.record);

    expect(meter.lead()).toBe(0.02);
  });

  it.each([-1, NaN, Infinity])('ignores a measurement of %s', (seconds) => {
    const meter = createLeadMeter();
    meter.record(seconds);

    expect(meter.lead()).toBe(defaultLead);
  });

  it.each([
    { seconds: 0, lead: 0.01 },
    { seconds: 3, lead: 0.5 },
  ])('keeps the lead within its bounds ($seconds s)', ({ seconds, lead }) => {
    const meter = createLeadMeter();
    meter.record(seconds);

    expect(meter.lead()).toBe(lead);
  });
});

describe('msUntilHandoff', () => {
  it('waits until the lead before the end', () => {
    expect(msUntilHandoff(10, 4, 0.1)).toBeCloseTo(5900);
  });

  it('starts at once when less than the lead is left', () => {
    expect(msUntilHandoff(10, 9.95, 0.1)).toBe(0);
  });

  it.each([Infinity, NaN, 0])('has no wait for a duration of %s', (duration) => {
    expect(msUntilHandoff(duration, 1, 0.1)).toBeUndefined();
  });
});

describe('liveEdgeTarget', () => {
  it.each([
    { bufferedEnd: undefined, target: undefined },
    { bufferedEnd: 18, target: undefined },
    { bufferedEnd: 18.5, target: 17.5 },
  ])('from 10 s with audio held up to $bufferedEnd s goes to $target', ({ bufferedEnd, target }) => {
    expect(liveEdgeTarget(bufferedEnd, 10)).toBe(target);
  });
});
