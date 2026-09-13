import { describe, it, expect } from 'vitest';
import { parseTraceLines, groupByRun, summariseRun, formatSummary, formatTimeline } from './report.js';
import type { TraceEvent } from './trace.js';

const event = (over: Partial<TraceEvent>): TraceEvent => ({
	runId: 'r1',
	seq: 1,
	at: 1_000,
	type: 'step',
	...over,
});

const jsonl = [
	JSON.stringify(event({ seq: 1, at: 1000, type: 'think', thought: 'plan it' })),
	JSON.stringify(
		event({
			seq: 2,
			at: 1500,
			type: 'act',
			tool: 'read_file',
			model: 'claude-opus-5',
			usage: { inputTokens: 1000, outputTokens: 200 },
		}),
	),
	JSON.stringify(event({ seq: 3, at: 2500, type: 'observe', ok: true })),
	JSON.stringify(event({ runId: 'r2', seq: 1, at: 9000, type: 'think' })),
].join('\n');

describe('parseTraceLines', () => {
	it('parses one event per line', () => {
		const { events, malformed } = parseTraceLines(jsonl);
		expect(events).toHaveLength(4);
		expect(malformed).toBe(0);
	});

	it('ignores blank lines and trailing newlines', () => {
		expect(parseTraceLines(`\n${jsonl}\n\n`).events).toHaveLength(4);
	});

	it('counts malformed lines instead of throwing on a half-written trace', () => {
		const { events, malformed } = parseTraceLines(`${jsonl}\n{"truncated":`);
		expect(events).toHaveLength(4);
		expect(malformed).toBe(1);
	});

	it('rejects JSON that is not a trace event', () => {
		expect(parseTraceLines('[1,2,3]\n"hello"').malformed).toBe(2);
	});

	it('returns nothing for empty input', () => {
		expect(parseTraceLines('')).toEqual({ events: [], malformed: 0 });
	});
});

describe('groupByRun', () => {
	it('splits events by run id, preserving order', () => {
		const groups = groupByRun(parseTraceLines(jsonl).events);
		expect([...groups.keys()]).toEqual(['r1', 'r2']);
		expect(groups.get('r1')).toHaveLength(3);
		expect(groups.get('r1')?.map((e) => e.seq)).toEqual([1, 2, 3]);
	});
});

describe('summariseRun', () => {
	const summary = summariseRun(groupByRun(parseTraceLines(jsonl).events).get('r1')!);

	it('reports span and duration', () => {
		expect(summary).toMatchObject({ runId: 'r1', events: 3, startedAt: 1000, endedAt: 2500 });
		expect(summary.durationMs).toBe(1500);
	});

	it('counts events by type', () => {
		expect(summary.byType).toEqual({ think: 1, act: 1, observe: 1 });
	});

	it('accumulates token usage across events', () => {
		expect(summary.usage).toMatchObject({ inputTokens: 1000, outputTokens: 200 });
	});

	it('prices the usage it can and lists models it cannot', () => {
		expect(summary.costUsd).toBeCloseTo(1000 * 5e-6 + 200 * 25e-6, 9);
		expect(summary.unpricedModels).toEqual([]);
	});

	it('flags an unpriced model instead of undercounting silently', () => {
		const result = summariseRun([
			event({ type: 'act', model: 'gemini-2.5-flash', usage: { inputTokens: 500 } }),
		]);
		expect(result.costUsd).toBe(0);
		expect(result.unpricedModels).toEqual(['gemini-2.5-flash']);
	});

	it('collects error events', () => {
		const result = summariseRun([
			event({ seq: 1, type: 'error', message: 'tool blew up' }),
			event({ seq: 2, type: 'observe' }),
		]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.message).toBe('tool blew up');
	});

	it('handles a run with no events', () => {
		const empty = summariseRun([]);
		expect(empty).toMatchObject({ events: 0, durationMs: 0, costUsd: 0 });
	});
});

describe('formatting', () => {
	const events = groupByRun(parseTraceLines(jsonl).events).get('r1')!;

	it('renders a summary with run id, counts, and cost', () => {
		const text = formatSummary(summariseRun(events));
		expect(text).toContain('r1');
		expect(text).toContain('think');
		expect(text).toMatch(/\$/);
		expect(text).toMatch(/1500ms|1\.5s/);
	});

	it('renders a timeline one line per event, in order', () => {
		const lines = formatTimeline(events).trim().split('\n');
		expect(lines).toHaveLength(3);
		expect(lines[0]).toContain('think');
		expect(lines[2]).toContain('observe');
	});

	it('shows time offsets from the start of the run', () => {
		expect(formatTimeline(events)).toContain('+500');
	});

	it('truncates a huge event payload', () => {
		const line = formatTimeline([event({ type: 'act', blob: 'x'.repeat(5000) })], {
			maxChars: 120,
		});
		expect(line.length).toBeLessThan(400);
	});
});
