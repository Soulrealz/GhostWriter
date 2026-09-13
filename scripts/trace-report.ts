#!/usr/bin/env tsx
/**
 * Read agent run traces and print what happened.
 *
 *   pnpm trace:report                       # every trace in .ghostwriter/ectoplasm/
 *   pnpm trace:report path/to/run.jsonl     # one file
 *   pnpm trace:report --timeline            # every event, not just the summary
 *
 * Read-only. Does not call a model and needs no API key.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseTraceLines, groupByRun, summariseRun, formatSummary, formatTimeline } from '../src/observability/report.js';

const TRACE_DIR = '.ghostwriter/ectoplasm';

const args = process.argv.slice(2);
const showTimeline = args.includes('--timeline');
const paths = args.filter((arg) => !arg.startsWith('--'));

const files = paths.length > 0 ? paths : discoverTraces();

if (files.length === 0) {
	console.log(`no traces found in ${TRACE_DIR}/ — run an agent first, or pass a file path`);
	process.exit(0);
}

let totalCost = 0;

for (const file of files) {
	if (!existsSync(file)) {
		console.error(`skipping ${file}: no such file`);
		process.exitCode = 1;
		continue;
	}

	const { events, malformed } = parseTraceLines(readFileSync(file, 'utf8'));
	console.log(`\n${'─'.repeat(72)}\n${file}`);
	if (malformed > 0) console.log(`  (${malformed} unparseable line(s) — trace may be truncated)`);

	for (const [, runEvents] of groupByRun(events)) {
		const summary = summariseRun(runEvents);
		totalCost += summary.costUsd;
		console.log(`\n${formatSummary(summary)}`);
		if (showTimeline) console.log(`\n${formatTimeline(runEvents)}`);
	}
}

if (files.length > 1) console.log(`\n${'─'.repeat(72)}\ntotal cost across traces: $${totalCost.toFixed(6)}`);

function discoverTraces(): string[] {
	if (!existsSync(TRACE_DIR)) return [];
	return readdirSync(TRACE_DIR)
		.filter((name) => name.endsWith('.jsonl'))
		.sort()
		.map((name) => join(TRACE_DIR, name));
}
