import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
	runEvalSet,
	formatReport,
	equals,
	contains,
	matches,
	conformsTo,
	check,
	type EvalCase,
} from './harness.js';

describe('check builders', () => {
	it('equals passes on a deep match and fails otherwise', async () => {
		expect((await equals({ a: 1 })({ a: 1 })).passed).toBe(true);
		expect((await equals({ a: 1 })({ a: 2 })).passed).toBe(false);
	});

	it('contains checks substrings', async () => {
		expect((await contains('wisp')('the wisp flickers')).passed).toBe(true);
		expect((await contains('wisp')('nothing here')).passed).toBe(false);
	});

	it('matches checks a regex', async () => {
		expect((await matches(/^ok:/)('ok: done')).passed).toBe(true);
		expect((await matches(/^ok:/)('fail')).passed).toBe(false);
	});

	it('conformsTo validates against a Zod schema', async () => {
		const schema = z.object({ file: z.string(), lines: z.number().int() });
		expect((await conformsTo(schema)({ file: 'a.ts', lines: 3 })).passed).toBe(true);
		const bad = await conformsTo(schema)({ file: 'a.ts', lines: 'three' });
		expect(bad.passed).toBe(false);
		expect(bad.detail).toMatch(/lines/);
	});

	it('check wraps an arbitrary predicate and keeps its name', async () => {
		const result = await check<number>('is even', (n) => n % 2 === 0)(3);
		expect(result).toMatchObject({ name: 'is even', passed: false });
	});

	it('supports an async check, for an LLM judge', async () => {
		const judge = check<string>('judged', async (o) => o.length > 2);
		expect((await judge('yes')).passed).toBe(true);
	});
});

describe('runEvalSet', () => {
	const cases: EvalCase<number, string>[] = [
		{ id: 'doubles', input: 2, checks: [equals('4')] },
		{ id: 'stringifies', input: 5, checks: [matches(/^\d+$/), contains('10')] },
	];
	const subject = async (n: number) => String(n * 2);

	it('reports every case and computes a pass rate', async () => {
		const report = await runEvalSet(cases, subject);
		expect(report.total).toBe(2);
		expect(report.passed).toBe(2);
		expect(report.failed).toBe(0);
		expect(report.passRate).toBe(1);
		expect(report.cases.map((c) => c.id)).toEqual(['doubles', 'stringifies']);
	});

	it('fails a case when any of its checks fails', async () => {
		const report = await runEvalSet([{ id: 'bad', input: 2, checks: [equals('5')] }], subject);
		expect(report.failed).toBe(1);
		expect(report.passRate).toBe(0);
		expect(report.cases[0]?.checks[0]?.passed).toBe(false);
	});

	it('records a thrown subject as a failure without aborting the set', async () => {
		const report = await runEvalSet(
			[
				{ id: 'explodes', input: 1, checks: [equals('2')] },
				{ id: 'fine', input: 3, checks: [equals('6')] },
			],
			async (n) => {
				if (n === 1) throw new Error('boom');
				return String(n * 2);
			},
		);
		expect(report.cases[0]).toMatchObject({ id: 'explodes', passed: false });
		expect(report.cases[0]?.error).toMatch(/boom/);
		expect(report.cases[1]?.passed).toBe(true);
		expect(report.failed).toBe(1);
	});

	it('treats an empty set as a vacuous pass rate of 1', async () => {
		const report = await runEvalSet([], subject);
		expect(report.total).toBe(0);
		expect(report.passRate).toBe(1);
	});

	it('times each case', async () => {
		const report = await runEvalSet(cases, subject);
		expect(report.cases.every((c) => typeof c.durationMs === 'number')).toBe(true);
	});
});

describe('formatReport', () => {
	it('renders pass and fail lines with the failing check detail', async () => {
		const report = await runEvalSet(
			[
				{ id: 'good', input: 2, checks: [equals('4')] },
				{ id: 'bad', input: 2, checks: [equals('99')] },
			],
			async (n: number) => String(n * 2),
		);
		const text = formatReport(report);
		expect(text).toContain('good');
		expect(text).toContain('bad');
		expect(text).toContain('1/2');
		expect(text).toMatch(/99/);
	});
});
