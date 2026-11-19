import { readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { parseArgs } from 'util';
import { z } from 'zod';

// usage: tsx scripts/claude/usage.ts [--since YYYY-MM-DD] [--top N] [--dir <transcripts>]   where the usage of Claude Code went, from the transcripts of this
// project (default: the last 7 days), with the weights of docs/development/claude-usage.md. See that doc for how to read it.
const weights = { cacheRead: 0.1, cacheWrite: 2, input: 1, output: 5 };
const bigContext = 200_000;

const usageSchema = z.object({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_creation_input_tokens: z.number().default(0),
  cache_read_input_tokens: z.number().default(0),
});
const blockSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  tool_use_id: z.string().optional(),
  content: z.union([z.string(), z.array(z.object({ text: z.string().optional() }))]).optional(),
});
const entrySchema = z.object({
  type: z.string().optional(),
  timestamp: z.string().optional(),
  message: z.object({ id: z.string().optional(), usage: usageSchema.optional(), content: z.union([z.string(), z.array(blockSchema)]).optional() }).optional(),
});

interface Call {
  cost: number;
  context: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}
interface Session {
  id: string;
  day: string;
  calls: Call[];
  results: { chars: number; what: string }[];
}

const callOf = (usage: z.infer<typeof usageSchema>): Call => ({
  cacheRead: usage.cache_read_input_tokens * weights.cacheRead,
  cacheWrite: usage.cache_creation_input_tokens * weights.cacheWrite,
  output: usage.output_tokens * weights.output,
  cost: 0,
  context: usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.input_tokens,
});

const costOf = (call: Call, input: number) => call.cacheRead + call.cacheWrite + call.output + input * weights.input;

const parseEntry = (line: string) => {
  try {
    return entrySchema.safeParse(JSON.parse(line)).data;
  } catch {
    return undefined;
  }
};

const textOf = (content: z.infer<typeof blockSchema>['content']) =>
  typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('');

const describeUse = (block: z.infer<typeof blockSchema>) =>
  `${block.name ?? 'tool'}: ${String(block.input?.command ?? block.input?.file_path ?? block.input?.description ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, 100)}`;

// the calls (each message id once: it is repeated for every content block), the results of the tools and the day of a transcript
const readSession = (id: string, text: string): Session => {
  const seen = new Set<string>();
  const uses = new Map<string, string>();
  const session: Session = { id, day: '', calls: [], results: [] };
  text
    .split('\n')
    .filter(Boolean)
    .map(parseEntry)
    .forEach((entry) => {
      session.day ||= entry?.timestamp?.slice(0, 10) ?? '';
      const blocks = typeof entry?.message?.content === 'object' ? entry.message.content : [];
      blocks.filter((block) => block.type === 'tool_use' && block.id).forEach((block) => uses.set(block.id ?? '', describeUse(block)));
      blocks
        .filter((block) => block.type === 'tool_result')
        .forEach((block) => session.results.push({ chars: textOf(block.content).length, what: uses.get(block.tool_use_id ?? '') ?? 'unknown' }));
      const messageId = entry?.message?.id;
      const usage = entry?.message?.usage;
      if (entry?.type !== 'assistant' || !usage || (messageId && seen.has(messageId))) {
        return;
      }
      seen.add(messageId ?? '');
      const call = callOf(usage);
      session.calls.push({ ...call, cost: costOf(call, usage.input_tokens) });
    });
  return session;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const millions = (value: number) => `${(value / 1e6).toFixed(1)}M`;
const percent = (part: number, whole: number) => `${Math.round((part / (whole || 1)) * 100)}%`;
const costOfSession = (session: Session) => sum(session.calls.map((call) => call.cost));

const report = (sessions: Session[], top = 8) => {
  const calls = sessions.flatMap((session) => session.calls);
  const total = sum(calls.map((call) => call.cost));
  const days = Object.entries(Object.groupBy(sessions, (session) => session.day)).map(
    ([day, group]) => `${day} ${millions(sum((group ?? []).map(costOfSession)))}`
  );
  const starts = sessions.flatMap((session) => session.calls.slice(0, 1).map((call) => call.context)).sort((a, b) => a - b);
  const biggest = [...sessions].sort((a, b) => costOfSession(b) - costOfSession(a));
  return [
    `${sessions.length} sessions, ${calls.length} calls, ${millions(total)} weighted tokens`,
    `cache read ${percent(sum(calls.map((call) => call.cacheRead)), total)}, cache write ${percent(sum(calls.map((call) => call.cacheWrite)), total)}, output ${percent(sum(calls.map((call) => call.output)), total)}`,
    `calls over ${bigContext / 1000}K of context: ${percent(sum(calls.filter((call) => call.context > bigContext).map((call) => call.cost)), total)}; the ${top} costliest sessions: ${percent(sum(biggest.slice(0, top).map(costOfSession)), total)}`,
    `start context: median ${Math.round((starts[starts.length >> 1] ?? 0) / 1000)}K, re-read on every call it is about ${percent((starts[starts.length >> 1] ?? 0) * calls.length * weights.cacheRead, total)} of the total`,
    `\nper day: ${days.sort().join(', ')}`,
    `\ncostliest sessions:`,
    ...biggest
      .slice(0, top)
      .map(
        (session) =>
          `  ${session.id.slice(0, 8)} ${session.day} ${session.calls.length} calls, max context ${Math.round(Math.max(0, ...session.calls.map((call) => call.context)) / 1000)}K, ${millions(costOfSession(session))}`
      ),
    `\nlargest tool results:`,
    ...sessions
      .flatMap((session) => session.results.map((result) => ({ ...result, id: session.id.slice(0, 6) })))
      .sort((a, b) => b.chars - a.chars)
      .slice(0, top)
      .map((result) => `  ${result.chars} chars ${result.id} ${result.what}`),
  ].join('\n');
};

const main = () => {
  const { values } = parseArgs({ options: { since: { type: 'string' }, top: { type: 'string' }, dir: { type: 'string' } } });
  const since = values.since ?? new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const dir = values.dir ?? join(homedir(), '.claude', 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));
  const sessions = readdirSync(dir)
    .filter((file) => file.endsWith('.jsonl'))
    .map((file) => readSession(file.replace(/\.jsonl$/, ''), readFileSync(join(dir, file), 'utf8')))
    .filter((session) => session.calls.length && session.day >= since);
  console.log(`since ${since}\n${report(sessions, Number(values.top) || 8)}`);
};

if (require.main === module) {
  main();
}

export { readSession, report };
