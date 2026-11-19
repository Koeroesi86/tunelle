import { describe, expect, it } from 'vitest';
import { readSession, report } from './usage';

const usage = (read: number, write: number, output: number) => ({
  input_tokens: 1,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  output_tokens: output,
});
const assistant = (id: string, day: string, tokens: ReturnType<typeof usage>, content: object[] = []) =>
  JSON.stringify({ type: 'assistant', timestamp: `${day}T10:00:00Z`, message: { id, usage: tokens, content } });

const transcript = [
  assistant('m1', '2026-11-10', usage(40_000, 1_000, 100), [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'git show HEAD' } }]),
  assistant('m1', '2026-11-10', usage(40_000, 1_000, 100)),
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(5000) }] } }),
  assistant('m2', '2026-11-10', usage(250_000, 500, 50)),
  'not json',
].join('\n');

describe('readSession', () => {
  it('counts each message once, with its weighted cost and context', () => {
    const session = readSession('abc', transcript);

    expect(session.day).toBe('2026-11-10');
    expect(session.calls.map((call) => call.context)).toEqual([41_001, 250_501]);
    expect(session.calls[0].cost).toBe(40_000 * 0.1 + 1_000 * 2 + 100 * 5 + 1);
  });

  it('names the command of a large tool result', () => {
    expect(readSession('abc', transcript).results).toEqual([{ chars: 5000, what: 'Bash: git show HEAD' }]);
  });
});

describe('report', () => {
  it('gives the totals, the share of big contexts, the costliest sessions and the largest results', () => {
    const text = report([readSession('abcdefghij', transcript)], 2);

    expect(text).toContain('1 sessions, 2 calls');
    expect(text).toContain('calls over 200K of context: 8');
    expect(text).toContain('abcdefgh 2026-11-10 2 calls, max context 251K');
    expect(text).toContain('5000 chars abcdef Bash: git show HEAD');
  });
});
