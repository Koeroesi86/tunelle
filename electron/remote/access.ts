import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';

export const MAX_NAME_LENGTH = 60;
export const MAX_NOTE_LENGTH = 200;
export const MAX_PENDING = 5;
export const MAX_REQUESTS_PER_MINUTE = 5;
const PENDING_MINUTES = 10;
const MINUTE = 60_000;

export const CONTROLS = ['playPause', 'skip', 'seek', 'volume', 'queue'] as const;
export type Control = (typeof CONTROLS)[number];

// control characters (a note is shown as plain text, but a line break or an escape has no place in a name)
const plain = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

const connectRequestSchema = z.object({
  deviceId: z.uuid(),
  deviceName: z.string().max(MAX_NAME_LENGTH).transform(plain).pipe(z.string().min(1)),
  note: z.string().max(MAX_NOTE_LENGTH).transform(plain).default(''),
});
export type ConnectRequest = z.infer<typeof connectRequestSchema>;

const storedDeviceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  secretHash: z.string(),
  blocked: z.boolean(),
  controls: z.array(z.enum(CONTROLS)),
});
export type StoredDevice = z.infer<typeof storedDeviceSchema>;

export interface PendingRequest extends ConnectRequest {
  address: string;
  at: number;
}

export type RequestResult =
  | { status: 'pending' }
  | { status: 'approved'; secret?: string }
  | { status: 'invalid' }
  | { status: 'blocked' }
  | { status: 'rate-limited' }
  | { status: 'full' };

const hashOf = (secret: string) => createHash('sha256').update(secret).digest();

/** Who may listen to the host: the requests that wait for an answer, the approved devices and the blocked ones. See docs/app/remote-access-discovery.md */
export class AccessControl {
  private devices = new Map<string, StoredDevice>();
  private waiting = new Map<string, PendingRequest>();
  private attempts = new Map<string, number[]>();
  // the secret waits here until the device that was approved asks again, and is handed over once
  private issued = new Map<string, string>();

  constructor(stored: unknown = []) {
    z.array(storedDeviceSchema)
      .catch([])
      .parse(stored)
      .forEach((device) => this.devices.set(device.id, device));
  }

  /** What to write to disk: the hash of the secret, never the secret */
  snapshot(): StoredDevice[] {
    return [...this.devices.values()];
  }

  pending(): PendingRequest[] {
    this.dropExpired();
    return [...this.waiting.values()];
  }

  request(address: string, body: unknown): RequestResult {
    if (!this.allowed(address)) return { status: 'rate-limited' };
    const parsed = connectRequestSchema.safeParse(body);
    if (!parsed.success) return { status: 'invalid' };

    const known = this.devices.get(parsed.data.deviceId);
    // a blocked device is dropped before a prompt exists, and an approved one has no need to ask again
    if (known?.blocked) return { status: 'blocked' };
    if (known) return this.collect(known.id);

    this.dropExpired();
    const again = this.waiting.has(parsed.data.deviceId);
    if (!again && this.waiting.size >= MAX_PENDING) return { status: 'full' };
    this.waiting.set(parsed.data.deviceId, { ...parsed.data, address, at: Date.now() });
    return { status: 'pending' };
  }

  /** Approves a waiting request: the secret is returned once, and only its hash is kept */
  approve(deviceId: string, controls: Control[] = []): { secret: string } | undefined {
    const request = this.waiting.get(deviceId);
    if (!request) return undefined;

    const secret = randomBytes(32).toString('base64url');
    this.waiting.delete(deviceId);
    this.issued.set(deviceId, secret);
    this.devices.set(deviceId, { id: deviceId, name: request.deviceName, secretHash: hashOf(secret).toString('hex'), blocked: false, controls });
    return { secret };
  }

  deny(deviceId: string): boolean {
    return this.waiting.delete(deviceId);
  }

  /** The next request of a revoked device needs a new approval */
  revoke(deviceId: string): boolean {
    this.waiting.delete(deviceId);
    this.issued.delete(deviceId);
    return this.devices.delete(deviceId);
  }

  block(deviceId: string, name = 'Blocked device') {
    const known = this.devices.get(deviceId);
    this.waiting.delete(deviceId);
    this.issued.delete(deviceId);
    this.devices.set(deviceId, { id: deviceId, name: known?.name ?? name, secretHash: '', blocked: true, controls: [] });
  }

  setControls(deviceId: string, controls: Control[]): boolean {
    const known = this.devices.get(deviceId);
    if (!known || known.blocked) return false;
    this.devices.set(deviceId, { ...known, controls });
    return true;
  }

  /** The approved device that this id and secret belong to; a pending, denied, blocked or revoked one is not */
  authenticate(deviceId: string, secret: string): StoredDevice | undefined {
    const known = this.devices.get(deviceId);
    if (!known || known.blocked) return undefined;

    const expected = Buffer.from(known.secretHash, 'hex');
    const given = hashOf(secret);
    return expected.length === given.length && timingSafeEqual(expected, given) ? known : undefined;
  }

  private collect(deviceId: string): RequestResult {
    const secret = this.issued.get(deviceId);
    this.issued.delete(deviceId);
    return { status: 'approved', secret };
  }

  private allowed(address: string): boolean {
    const now = Date.now();
    const recent = (this.attempts.get(address) ?? []).filter((at) => now - at < MINUTE);
    this.attempts.set(address, [...recent, now]);
    // an address that stopped asking is forgotten, so the map does not grow with every visitor
    [...this.attempts.keys()]
      .filter((key) => key !== address && !this.attempts.get(key)?.some((at) => now - at < MINUTE))
      .forEach((key) => this.attempts.delete(key));
    return recent.length < MAX_REQUESTS_PER_MINUTE;
  }

  private dropExpired() {
    const limit = Date.now() - PENDING_MINUTES * MINUTE;
    [...this.waiting.values()].filter((request) => request.at < limit).forEach((request) => this.waiting.delete(request.deviceId));
  }
}
