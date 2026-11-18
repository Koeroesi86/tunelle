import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessControl, MAX_NAME_LENGTH, MAX_NOTE_LENGTH, MAX_PENDING, MAX_REQUESTS_PER_MINUTE, MAX_WRONG_SECRETS_PER_MINUTE } from './access';

const body = (overrides: Record<string, unknown> = {}) => ({ deviceId: randomUUID(), deviceName: 'Living room speaker', note: 'Hello', ...overrides });

describe('AccessControl', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  describe('a request', () => {
    it('waits for the host as a pending request with the note as it was sent', () => {
      const access = new AccessControl();
      const request = body({ note: '<img src=x onerror=alert(1)>' });

      expect(access.request('10.0.0.2', request)).toEqual({ status: 'pending' });
      expect(access.pending()).toMatchObject([
        { deviceId: request.deviceId, deviceName: 'Living room speaker', note: '<img src=x onerror=alert(1)>', address: '10.0.0.2' },
      ]);
    });

    it('is refused when it is not a request, and shows nothing to the host', () => {
      const access = new AccessControl();

      expect(access.request('10.0.0.2', 'hello')).toEqual({ status: 'invalid' });
      expect(access.request('10.0.0.2', body({ deviceId: 'not-an-id' }))).toEqual({ status: 'invalid' });
      expect(access.request('10.0.0.2', body({ deviceName: '   ' }))).toEqual({ status: 'invalid' });
      expect(access.request('10.0.0.2', body({ deviceName: 'x'.repeat(MAX_NAME_LENGTH + 1) }))).toEqual({ status: 'invalid' });
      expect(access.request('10.0.0.2', body({ note: 'x'.repeat(MAX_NOTE_LENGTH + 1) }))).toEqual({ status: 'invalid' });
      expect(access.pending()).toEqual([]);
    });

    it('turns control characters of the name and the note into spaces and keeps an empty note', () => {
      const access = new AccessControl();

      access.request('10.0.0.2', body({ deviceName: 'Kitchen\u001b[31m\nspeaker', note: undefined }));

      expect(access.pending()[0]).toMatchObject({ deviceName: 'Kitchen [31m speaker', note: '' });
    });

    it('is one prompt when the same device asks again', () => {
      const access = new AccessControl();
      const request = body();

      access.request('10.0.0.2', request);
      access.request('10.0.0.2', request);

      expect(access.pending()).toHaveLength(1);
    });

    it('stops at the pending limit, and a device that already waits is still answered', () => {
      const access = new AccessControl();
      const waiting = body();
      access.request('10.0.0.1', waiting);
      Array.from({ length: MAX_PENDING - 1 }, (_, index) => access.request(`10.0.0.${index + 10}`, body()));

      expect(access.request('10.0.0.99', body())).toEqual({ status: 'full' });
      expect(access.request('10.0.0.1', waiting)).toEqual({ status: 'pending' });
      expect(access.pending()).toHaveLength(MAX_PENDING);
    });

    it('is forgotten after ten minutes, which frees a place', () => {
      const access = new AccessControl();
      access.request('10.0.0.2', body());

      vi.setSystemTime(new Date('2026-11-17T10:10:01Z'));

      expect(access.pending()).toEqual([]);
    });

    it('is rate limited per address, and another address is not', () => {
      const access = new AccessControl();
      const same = body();
      Array.from({ length: MAX_REQUESTS_PER_MINUTE }, () => access.request('10.0.0.2', same));

      expect(access.request('10.0.0.2', body())).toEqual({ status: 'rate-limited' });
      expect(access.request('10.0.0.3', body())).toEqual({ status: 'pending' });
    });

    it('is let in again a minute later', () => {
      const access = new AccessControl();
      const same = body();
      Array.from({ length: MAX_REQUESTS_PER_MINUTE }, () => access.request('10.0.0.2', same));

      vi.setSystemTime(new Date('2026-11-17T10:01:01Z'));

      expect(access.request('10.0.0.2', body())).toEqual({ status: 'pending' });
    });

    it('does not count a rate limited request as an open prompt', () => {
      const access = new AccessControl();
      Array.from({ length: MAX_REQUESTS_PER_MINUTE + 20 }, () => access.request('10.0.0.2', body()));

      expect(access.pending()).toHaveLength(MAX_REQUESTS_PER_MINUTE);
    });
  });

  describe('approval', () => {
    it('issues a secret once that opens the device, and keeps only its hash', () => {
      const access = new AccessControl();
      const request = body();
      access.request('10.0.0.2', request);

      const approved = access.approve(request.deviceId);

      expect(approved?.secret).toBeTruthy();
      expect(access.authenticate(request.deviceId, approved?.secret ?? '')).toMatchObject({ id: request.deviceId, name: 'Living room speaker', controls: [] });
      expect(JSON.stringify(access.snapshot())).not.toContain(approved?.secret);
      expect(access.pending()).toEqual([]);
    });

    it('does not open for a pending, a denied or an unknown device or for a wrong secret', () => {
      const access = new AccessControl();
      const pending = body();
      const denied = body();
      const approved = body();
      [pending, denied, approved].forEach((request) => access.request('10.0.0.2', request));
      access.deny(denied.deviceId);
      const secret = access.approve(approved.deviceId)?.secret ?? '';

      expect(access.authenticate(pending.deviceId, secret)).toBeUndefined();
      expect(access.authenticate(denied.deviceId, secret)).toBeUndefined();
      expect(access.authenticate(randomUUID(), secret)).toBeUndefined();
      expect(access.authenticate(approved.deviceId, `${secret}x`)).toBeUndefined();
      expect(access.authenticate(approved.deviceId, '')).toBeUndefined();
    });

    it('has nothing to approve or deny that did not ask', () => {
      const access = new AccessControl();

      expect(access.approve(randomUUID())).toBeUndefined();
      expect(access.deny(randomUUID())).toBe(false);
    });

    it('answers an approved device that asks again without a prompt', () => {
      const access = new AccessControl();
      const request = body();
      access.request('10.0.0.2', request);
      const secret = access.approve(request.deviceId)?.secret;

      expect(access.request('10.0.0.2', request)).toEqual({ status: 'approved', secret });
      expect(access.request('10.0.0.2', request)).toEqual({ status: 'approved', secret: undefined });
      expect(access.pending()).toEqual([]);
    });

    it('hands the secret over to a request once, and not after a block or a revoke', () => {
      const access = new AccessControl();
      const request = body();
      access.request('10.0.0.2', request);
      access.approve(request.deviceId);

      access.revoke(request.deviceId);

      expect(access.request('10.0.0.2', request)).toEqual({ status: 'pending' });
    });

    it('is remembered through the snapshot, so a restart needs no new prompt', () => {
      const first = new AccessControl();
      const request = body();
      first.request('10.0.0.2', request);
      const secret = first.approve(request.deviceId, ['playPause'])?.secret ?? '';

      const restarted = new AccessControl(JSON.parse(JSON.stringify(first.snapshot())));

      expect(restarted.authenticate(request.deviceId, secret)).toMatchObject({ controls: ['playPause'] });
    });

    it('starts empty when the stored file is not a list of devices', () => {
      expect(new AccessControl({ devices: 'x' }).snapshot()).toEqual([]);
      expect(new AccessControl([{ id: 'x' }]).snapshot()).toEqual([]);
    });
  });

  describe('revoke and block', () => {
    it('closes a revoked device, and its next request is a new prompt', () => {
      const access = new AccessControl();
      const request = body();
      access.request('10.0.0.2', request);
      const secret = access.approve(request.deviceId)?.secret ?? '';

      expect(access.revoke(request.deviceId)).toBe(true);

      expect(access.authenticate(request.deviceId, secret)).toBeUndefined();
      expect(access.request('10.0.0.2', request)).toEqual({ status: 'pending' });
    });

    it('drops a blocked device before a prompt, and its old secret no longer opens', () => {
      const access = new AccessControl();
      const request = body();
      access.request('10.0.0.2', request);
      const secret = access.approve(request.deviceId)?.secret ?? '';

      access.block(request.deviceId);

      expect(access.authenticate(request.deviceId, secret)).toBeUndefined();
      expect(access.request('10.0.0.9', request)).toEqual({ status: 'blocked' });
      expect(access.pending()).toEqual([]);
      expect(access.snapshot()).toMatchObject([{ id: request.deviceId, name: 'Living room speaker', blocked: true, secretHash: '' }]);
    });

    it('blocks a device that waits, and takes it off the list of prompts', () => {
      const access = new AccessControl();
      const request = body();
      access.request('10.0.0.2', request);

      access.block(request.deviceId);

      expect(access.pending()).toEqual([]);
      expect(access.request('10.0.0.2', request)).toEqual({ status: 'blocked' });
    });
  });

  describe('controls', () => {
    it('are granted per device on top of the approval, and only to an approved one', () => {
      const access = new AccessControl();
      const request = body();
      const blocked = body();
      access.request('10.0.0.2', request);
      const secret = access.approve(request.deviceId)?.secret ?? '';
      access.block(blocked.deviceId);

      expect(access.setControls(request.deviceId, ['seek', 'volume'])).toBe(true);
      expect(access.setControls(blocked.deviceId, ['seek'])).toBe(false);
      expect(access.setControls(randomUUID(), ['seek'])).toBe(false);
      expect(access.authenticate(request.deviceId, secret)?.controls).toEqual(['seek', 'volume']);
    });
  });

  describe('wrong secrets', () => {
    const approvedDevice = () => {
      const access = new AccessControl();
      const request = body();
      access.request('10.0.0.2', request);
      return { access, id: request.deviceId, secret: access.approve(request.deviceId)?.secret ?? '' };
    };

    it('are counted per address, and past the limit even the right secret waits until the minute is over', () => {
      const { access, id, secret } = approvedDevice();
      const guesses = Array.from({ length: MAX_WRONG_SECRETS_PER_MINUTE }, () => access.authorize('10.0.0.9', id, 'wrong').status);

      expect(guesses).toEqual(Array(MAX_WRONG_SECRETS_PER_MINUTE).fill('unauthorized'));
      expect(access.authorize('10.0.0.9', id, secret).status).toBe('rate-limited');
      expect(access.authorize('10.0.0.3', id, secret).status).toBe('ok');

      vi.setSystemTime(new Date('2026-11-17T10:01:01Z'));
      expect(access.authorize('10.0.0.9', id, secret).status).toBe('ok');
    });

    it('do not count the right secrets of a listener that asks every second', () => {
      const { access, id, secret } = approvedDevice();

      const answers = Array.from({ length: MAX_WRONG_SECRETS_PER_MINUTE * 3 }, () => access.authorize('10.0.0.9', id, secret).status);

      expect(new Set(answers)).toEqual(new Set(['ok']));
    });
  });
});
