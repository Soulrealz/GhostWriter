import type { TraceEvent } from './trace.js';
import { estimateCostUsd, priceFor, formatUsd, type TokenUsage } from './cost.js';
import { previewJson } from '../context/toolResult.js';

/**
 * Read side of the tracer: turn a `.jsonl` run log back into something a human
 * can scan. Pairs with `scripts/trace-report.ts`.
 *
 * Convention it relies on — an event may carry `model` and `usage`
 * (`{inputTokens, outputTokens, ...}`). Nothing else is assumed, so the loop
 * stays free to emit whatever event types it likes.
 */

export interface TraceSummary {
	runId: string;
	events: number;
	byType: Record<string, number>;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	usage: Required<TokenUsage>;
	costUsd: number;
	/** Models whose spend could not be priced — the cost above excludes them. */
	unpricedModels: string[];
	errors: TraceEvent[];
}

export function parseTraceLines(text: string): { events: TraceEvent[]; malformed: number } {
	const events: TraceEvent[] = [];
	let malformed = 0;

	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			const parsed: unknown = JSON.parse(trimmed);
			// A trace that was cut off mid-write is normal (the process died, which
			// is usually the thing being investigated). Count and carry on.
			if (isTraceEvent(parsed)) events.push(parsed);
			else malformed += 1;
		} catch {
			malformed += 1;
		}
	}
	return { events, malformed };
}

function isTraceEvent(value: unknown): value is TraceEvent {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const candidate = value as Partial<TraceEvent>;
	return typeof candidate.runId === 'string' && typeof candidate.type === 'string';
}

export function groupByRun(events: TraceEvent[]): Map<string, TraceEvent[]> {
	const groups = new Map<string, TraceEvent[]>();
	for (const event of events) {
		const bucket = groups.get(event.runId);
		if (bucket) bucket.push(event);
		else groups.set(event.runId, [event]);
	}
	return groups;
}

export function summariseRun(events: TraceEvent[]): TraceSummary {
	const byType: Record<string, number> = {};
	const usage: Required<TokenUsage> = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
	};
	const unpriced = new Set<string>();
	let costUsd = 0;

	for (const event of events) {
		byType[event.type] = (byType[event.type] ?? 0) + 1;

		const eventUsage = readUsage(event);
		if (!eventUsage) continue;
		for (const key of Object.keys(usage) as (keyof TokenUsage)[]) {
			usage[key] += eventUsage[key] ?? 0;
		}

		const model = typeof event.model === 'string' ? event.model : null;
		if (!model) continue;
		if (priceFor(model)) costUsd += estimateCostUsd(model, eventUsage);
		else unpriced.add(model);
	}

	const times = events.map((e) => (typeof e.at === 'number' ? e.at : 0));
	const startedAt = times.length ? Math.min(...times) : 0;
	const endedAt = times.length ? Math.max(...times) : 0;

	return {
		runId: events[0]?.runId ?? '(none)',
		events: events.length,
		byType,
		startedAt,
		endedAt,
		durationMs: endedAt - startedAt,
		usage,
		costUsd,
		unpricedModels: [...unpriced],
		errors: events.filter((e) => e.type === 'error' || e.error !== undefined),
	};
}

function readUsage(event: TraceEvent): TokenUsage | null {
	const raw = event.usage;
	if (raw === null || typeof raw !== 'object') return null;
	const usage = raw as TokenUsage;
	return {
		inputTokens: numberOr0(usage.inputTokens),
		outputTokens: numberOr0(usage.outputTokens),
		cacheReadTokens: numberOr0(usage.cacheReadTokens),
		cacheWriteTokens: numberOr0(usage.cacheWriteTokens),
	};
}

const numberOr0 = (value: unknown): number => (typeof value === 'number' ? value : 0);

export function formatSummary(summary: TraceSummary): string {
	const types = Object.entries(summary.byType)
		.sort(([, a], [, b]) => b - a)
		.map(([type, count]) => `${type}×${count}`)
		.join('  ');

	const lines = [
		`run ${summary.runId}`,
		`  events    ${summary.events}   ${types}`,
		`  duration  ${summary.durationMs}ms`,
		`  tokens    ${summary.usage.inputTokens} in / ${summary.usage.outputTokens} out`,
		`  cost      ${formatUsd(summary.costUsd)}`,
	];
	if (summary.unpricedModels.length) {
		lines.push(`  unpriced  ${summary.unpricedModels.join(', ')} (excluded from cost)`);
	}
	if (summary.errors.length) lines.push(`  errors    ${summary.errors.length}`);
	return lines.join('\n');
}

export function formatTimeline(events: TraceEvent[], options: { maxChars?: number } = {}): string {
	const maxChars = options.maxChars ?? 160;
	const start = events.length ? Math.min(...events.map((e) => numberOr0(e.at))) : 0;

	return events
		.map((event) => {
			const { runId: _runId, seq, at, type, ...rest } = event;
			const offset = `+${numberOr0(at) - start}ms`.padStart(9);
			const payload = Object.keys(rest).length
				? ` ${previewJson(rest, { maxChars, indent: 0 }).replace(/\s+/g, ' ')}`
				: '';
			return `${offset}  ${String(seq).padStart(3)}  ${type.padEnd(10)}${payload}`;
		})
		.join('\n');
}
