import { describe, expect, it } from 'vitest';
import { hostNameOf } from './remote-host-name';

const target = { host: '192.168.1.5', port: 4000 };
const nearby = [{ id: 'a', name: 'Living room', host: '192.168.1.5', port: 4000, version: '1' }];

describe('the name of the host that is followed', () => {
  it('is the announced name while the host is among those nearby', () => {
    expect(hostNameOf({ remoteListener: { status: 'listening', target }, remoteNearby: nearby })).toBe('Living room');
  });

  it('is the address while the host is not nearby, or only another port of it is', () => {
    expect(hostNameOf({ remoteListener: { status: 'listening', target }, remoteNearby: [] })).toBe('192.168.1.5:4000');
    expect(hostNameOf({ remoteListener: { status: 'listening', target: { ...target, port: 4001 } }, remoteNearby: nearby })).toBe('192.168.1.5:4001');
  });

  it('is nothing while this app does not listen', () => {
    expect(hostNameOf({ remoteListener: { status: 'waiting', target }, remoteNearby: nearby })).toBeUndefined();
    expect(hostNameOf({ remoteListener: undefined, remoteNearby: nearby })).toBeUndefined();
  });
});
