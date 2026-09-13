/**
 * Minimal eval harness.
 *
 * An eval set is cases + checks + a subject under test. The subject is any async
 * function — a single tool, a Wisp run, or a whole LangGraph invocation — so the
 * same harness covers Phase 1 and Phase 2 without change.
 *
 * Checks may be async, which is how an LLM-as-judge plugs in later without the
 * harness knowing anything about models: wrap the judge call in `check()`.
 */

export interface CheckResult {
	name: string;
	passed: boolean;
	detail?: string;
}

export type Check<T> = (output: T) => CheckResult | Promise<CheckResult>;

export interface EvalCase<Input, Output> {
	id: string;
	description?: string;
	input: Input;
	checks: Check<Output>[];
}

export interface CaseReport {
	id: string;
	description?: string;
	passed: boolean;
	checks: CheckResult[];
	error?: string;
	durationMs: number;
}

export interface EvalReport {
	cases: CaseReport[];
	total: number;
	passed: number;
	failed: number;
	/** 0-1. An empty set is 1 — vacuously true, so it never reads as a regression. */
	passRate: number;
}

export async function runEvalSet<Input, Output>(
	cases: EvalCase<Input, Output>[],
	subject: (input: Input) => Promise<Output>,
): Promise<EvalReport> {
	const reports: CaseReport[] = [];

	for (const testCase of cases) {
		const startedAt = performance.now();
		let checks: CheckResult[] = [];
		let error: string | undefined;

		try {
			const output = await subject(testCase.input);
			checks = await Promise.all(testCase.checks.map((c) => c(output)));
		} catch (cause) {
			// A thrown subject is one failing case, not a failing run — the rest of
			// the set still has to report, or a single flake hides every other result.
			error = cause instanceof Error ? cause.message : String(cause);
		}

		reports.push({
			id: testCase.id,
			...(testCase.description === undefined ? {} : { description: testCase.description }),
			passed: error === undefined && checks.every((c) => c.passed),
			checks,
			...(error === undefined ? {} : { error }),
			durationMs: Math.round(performance.now() - startedAt),
		});
	}

	const passed = reports.filter((r) => r.passed).length;
	return {
		cases: reports,
		total: reports.length,
		passed,
		failed: reports.length - passed,
		passRate: reports.length === 0 ? 1 : passed / reports.length,
	};
}

export function formatReport(report: EvalReport): string {
	const lines = [`${report.passed}/${report.total} cases passed`];

	for (const testCase of report.cases) {
		lines.push(`${testCase.passed ? 'PASS' : 'FAIL'}  ${testCase.id}  (${testCase.durationMs}ms)`);
		if (testCase.error) lines.push(`        threw: ${testCase.error}`);
		for (const check of testCase.checks.filter((c) => !c.passed)) {
			lines.push(`        ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
		}
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Check builders
// ---------------------------------------------------------------------------

export function equals<T>(expected: T): Check<T> {
	return (output) => ({
		name: 'equals',
		passed: stableStringify(output) === stableStringify(expected),
		detail: `expected ${stableStringify(expected)}, got ${stableStringify(output)}`,
	});
}

export function contains(needle: string): Check<string> {
	return (output) => ({
		name: `contains ${JSON.stringify(needle)}`,
		passed: output.includes(needle),
		detail: truncate(output),
	});
}

export function matches(pattern: RegExp): Check<string> {
	return (output) => ({
		name: `matches ${pattern}`,
		passed: pattern.test(output),
		detail: truncate(output),
	});
}

/** Structural check against any Zod schema (or anything with `safeParse`). */
export function conformsTo<T>(schema: {
	safeParse: (value: unknown) => { success: boolean; error?: unknown };
}): Check<T> {
	return (output) => {
		const result = schema.safeParse(output);
		return {
			name: 'conforms to schema',
			passed: result.success,
			...(result.success ? {} : { detail: describeZodError(result.error) }),
		};
	};
}

/** Wrap any predicate, sync or async. The async form is the LLM-judge seam. */
export function check<T>(name: string, predicate: (output: T) => boolean | Promise<boolean>): Check<T> {
	return async (output) => ({ name, passed: await predicate(output) });
}

// ---------------------------------------------------------------------------

function describeZodError(error: unknown): string {
	const issues = (error as { issues?: { path: (string | number)[]; message: string }[] })?.issues;
	if (!issues) return truncate(String(error));
	return issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

/** Key-sorted so object comparison does not depend on insertion order. */
function stableStringify(value: unknown): string {
	return JSON.stringify(value, (_key, val) => {
		if (val && typeof val === 'object' && !Array.isArray(val)) {
			return Object.fromEntries(Object.entries(val as object).sort(([a], [b]) => a.localeCompare(b)));
		}
		return val;
	});
}

function truncate(text: string, max = 120): string {
	return text.length <= max ? text : `${text.slice(0, max)}…`;
}
