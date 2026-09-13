import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { redactDeep, type RedactOptions } from '../safety/redact.js';

/**
 * Run tracing. A dumb, typed sink — it stamps and routes events but knows
 * nothing about what an agent step *is*, so the loop decides what to emit
 * (`think` / `act` / `observe`, or whatever the graph needs) and this stays
 * unchanged across all four levels.
 *
 * AGENTS.md §4: "a run that cannot be replayed from its log is not finished."
 * That is what the JSONL sink is for — one line per event, greppable, diffable,
 * and replayable without a hosted tracing service.
 */

export interface TraceEvent {
	runId: string;
	seq: number;
	/** Epoch ms. */
	at: number;
	type: string;
	[key: string]: unknown;
}

export interface TraceSink {
	write(event: TraceEvent): void;
	close?(): void;
}

export interface TracerOptions {
	sinks: TraceSink[];
	runId?: string;
	clock?: () => number;
	/** Passed to `redactDeep` before an event reaches any sink. */
	redactOptions?: RedactOptions;
}

export interface Tracer {
	readonly runId: string;
	emit(type: string, data?: Record<string, unknown>): TraceEvent;
}

export function createTracer(options: TracerOptions): Tracer {
	const runId = options.runId ?? `run-${randomUUID()}`;
	const clock = options.clock ?? (() => Date.now());
	let seq = 0;

	return {
		runId,
		emit(type, data = {}) {
			seq += 1;
			// Spread data first: the envelope fields must win, or a tool result
			// containing a `type` key silently rewrites the trace.
			const event: TraceEvent = {
				...redactDeep(data, options.redactOptions ?? {}),
				runId,
				seq,
				at: clock(),
				type,
			};

			for (const sink of options.sinks) {
				try {
					sink.write(event);
				} catch {
					// Observability must never be able to fail a run. A lost trace
					// line is a bad afternoon; a crashed agent mid-edit is worse.
				}
			}
			return event;
		},
	};
}

export interface MemorySink extends TraceSink {
	readonly events: TraceEvent[];
	clear(): void;
}

/** In-memory sink for tests and for assertions inside an eval case. */
export function createMemorySink(): MemorySink {
	const events: TraceEvent[] = [];
	return {
		events,
		write: (event) => void events.push(event),
		clear: () => void events.splice(0, events.length),
	};
}

/**
 * Append-only JSONL. Synchronous by design: a trace written after a crash is not
 * a trace, and these are small enough that the write cost is noise next to a
 * model round-trip.
 */
export function createJsonlSink(filePath: string): TraceSink {
	let ready = false;
	return {
		write(event) {
			if (!ready) {
				mkdirSync(dirname(filePath), { recursive: true });
				ready = true;
			}
			appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf8');
		},
	};
}

/** Conventional trace location: transient, unverified agent output. */
export function defaultTracePath(runId: string, root = process.cwd()): string {
	return `${root}/.ghostwriter/ectoplasm/${runId}.jsonl`;
}
