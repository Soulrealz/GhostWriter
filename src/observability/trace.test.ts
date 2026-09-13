import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTracer, createMemorySink, createJsonlSink } from './trace.js';

const dirs: string[] = [];
function tempDir() {
	const dir = mkdtempSync(join(tmpdir(), 'gw-trace-'));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('createTracer', () => {
	it('stamps each event with the run id, a sequence number, and a timestamp', () => {
		const sink = createMemorySink();
		const tracer = createTracer({ sinks: [sink], runId: 'run-1', clock: () => 1000 });

		tracer.emit('think', { thought: 'read the file first' });
		tracer.emit('act', { tool: 'read_file' });

		expect(sink.events).toEqual([
			{ runId: 'run-1', seq: 1, at: 1000, type: 'think', thought: 'read the file first' },
			{ runId: 'run-1', seq: 2, at: 1000, type: 'act', tool: 'read_file' },
		]);
	});

	it('generates a run id when none is given', () => {
		const a = createTracer({ sinks: [] });
		const b = createTracer({ sinks: [] });
		expect(a.runId).toMatch(/\S/);
		expect(a.runId).not.toBe(b.runId);
	});

	it('returns the event it emitted', () => {
		const tracer = createTracer({ sinks: [], runId: 'r', clock: () => 5 });
		expect(tracer.emit('observe', { ok: true })).toMatchObject({ type: 'observe', ok: true, seq: 1 });
	});

	it('fans out to every sink', () => {
		const a = createMemorySink();
		const b = createMemorySink();
		createTracer({ sinks: [a, b], runId: 'r' }).emit('step');
		expect(a.events).toHaveLength(1);
		expect(b.events).toHaveLength(1);
	});

	it('redacts secrets before they reach a sink', () => {
		const sink = createMemorySink();
		const tracer = createTracer({
			sinks: [sink],
			runId: 'r',
			redactOptions: { env: {}, secrets: ['hunter2hunter2'] },
		});
		tracer.emit('act', { command: 'login --token hunter2hunter2' });
		expect(JSON.stringify(sink.events)).not.toContain('hunter2hunter2');
		expect(JSON.stringify(sink.events)).toContain('[redacted]');
	});

	it('does not let a failing sink break the run', () => {
		const good = createMemorySink();
		const bad = {
			write() {
				throw new Error('disk full');
			},
		};
		const tracer = createTracer({ sinks: [bad, good], runId: 'r' });
		expect(() => tracer.emit('step')).not.toThrow();
		expect(good.events).toHaveLength(1);
	});

	it('cannot have its type or seq overwritten by event data', () => {
		const sink = createMemorySink();
		const tracer = createTracer({ sinks: [sink], runId: 'r', clock: () => 0 });
		tracer.emit('act', { type: 'spoofed', seq: 99 } as Record<string, unknown>);
		expect(sink.events[0]).toMatchObject({ type: 'act', seq: 1 });
	});
});

describe('createJsonlSink', () => {
	it('appends one JSON object per line and creates missing directories', () => {
		const file = join(tempDir(), 'nested', 'run.jsonl');
		const sink = createJsonlSink(file);
		const tracer = createTracer({ sinks: [sink], runId: 'r', clock: () => 1 });

		tracer.emit('think', { thought: 'a' });
		tracer.emit('act', { tool: 'b' });
		sink.close?.();

		expect(existsSync(file)).toBe(true);
		const lines = readFileSync(file, 'utf8').trim().split('\n');
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[0]!)).toMatchObject({ type: 'think', thought: 'a', seq: 1 });
		expect(JSON.parse(lines[1]!)).toMatchObject({ type: 'act', tool: 'b', seq: 2 });
	});

	it('appends to an existing file rather than replacing it', () => {
		const file = join(tempDir(), 'run.jsonl');
		createTracer({ sinks: [createJsonlSink(file)], runId: 'a' }).emit('one');
		createTracer({ sinks: [createJsonlSink(file)], runId: 'b' }).emit('two');
		expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
	});
});

describe('memory sink', () => {
	it('clears on demand', () => {
		const sink = createMemorySink();
		createTracer({ sinks: [sink], runId: 'r' }).emit('x');
		sink.clear();
		expect(sink.events).toHaveLength(0);
	});
});
