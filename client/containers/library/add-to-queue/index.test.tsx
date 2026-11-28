import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/library/add-to-queue/AddToQueue';
import { aTrack } from '../../../test/a-track';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/library/add-to-queue/AddToQueue', () => ({ default: vi.fn(() => null) }));

describe('the container of AddToQueue', () => {
  it.each([
    { next: false, type: 'ADD_TO_QUEUE' },
    { next: true, type: 'PLAY_NEXT' },
  ])('sends $type when next is $next', ({ next, type }) => {
    const tracks = [aTrack({ path: '/music/a.flac' })];
    const { sent } = renderContainer(<Container next={next} getTracks={() => Promise.resolve(tracks)} />);

    propsOf(View).add(tracks);

    expect(sent()).toEqual([{ type, payload: { tracks } }]);
  });
});
