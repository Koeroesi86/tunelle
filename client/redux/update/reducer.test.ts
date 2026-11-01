import { describe, expect, it } from 'vitest';
import type { UpdateState } from '../../../types/update';
import reducer from './reducer';

const state: UpdateState = { version: '26.10.5', electron: '40.0.0', chrome: '140.0.0', unavailable: undefined, automatic: true, status: { kind: 'idle' } };

describe('update reducer', () => {
  it('knows nothing before the main process answers', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toBeNull();
  });

  it.each([
    { kind: 'checking' },
    { kind: 'upToDate', checkedAt: 1000 },
    { kind: 'downloading', version: '26.10.6', percent: 40 },
    { kind: 'ready', version: '26.10.6' },
    { kind: 'failed', message: 'offline' },
  ] as const)('stores the $kind state', (status) => {
    expect(reducer(state, { type: 'UPDATE_STATE', payload: { ...state, status } })).toEqual({ ...state, status });
  });

  it('keeps the state for other actions', () => {
    expect(reducer(state, { type: 'CHECK_FOR_UPDATES' })).toBe(state);
    expect(reducer(state, { type: 'unrelated' })).toBe(state);
  });
});
