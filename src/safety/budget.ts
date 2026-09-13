/**
 * The Guardian's ledger (AGENTS.md §3, §4).
 *
 * An agent loop without a ceiling is an unbounded spend on a stochastic process.
 * Every cycle records its step here; hitting a limit is a halt with a report, not
 * a retry.
 */

export type BudgetLimit = 'maxSteps' | 'maxTokens' | 'maxCostUsd' | 'maxWallClockMs';

export interface BudgetLimits {
	maxSteps?: number;
	maxTokens?: number;
	maxCostUsd?: number;
	maxWallClockMs?: number;
}

export interface StepUsage {
	inputTokens?: number;
	outputTokens?: number;
	costUsd?: number;
}

export interface BudgetSnapshot {
	steps: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	costUsd: number;
	elapsedMs: number;
	/** Headroom left against each configured limit; `null` where unbounded. */
	remaining: {
		steps: number | null;
		tokens: number | null;
		costUsd: number | null;
		wallClockMs: number | null;
	};
}

export class BudgetExceededError extends Error {
	constructor(
		readonly limit: BudgetLimit,
		readonly snapshot: BudgetSnapshot,
		detail: string,
	) {
		super(`budget exceeded (${limit}): ${detail}`);
		this.name = 'BudgetExceededError';
	}
}

export class Budget {
	private steps = 0;
	private inputTokens = 0;
	private outputTokens = 0;
	private costUsd = 0;
	private readonly startedAt: number;
	private readonly now: () => number;

	constructor(
		private readonly limits: BudgetLimits,
		options: { now?: () => number } = {},
	) {
		this.now = options.now ?? (() => Date.now());
		this.startedAt = this.now();
	}

	/**
	 * Record one loop iteration, then enforce. Recording happens *before* the
	 * check so the snapshot attached to the error reflects what was actually
	 * spent — a report that under-counts the step that broke the budget is worse
	 * than useless in a post-mortem.
	 */
	recordStep(usage: StepUsage = {}): void {
		this.steps += 1;
		this.inputTokens += usage.inputTokens ?? 0;
		this.outputTokens += usage.outputTokens ?? 0;
		this.costUsd += usage.costUsd ?? 0;
		this.assertWithinLimits();
	}

	assertWithinLimits(): void {
		const limit = this.exceeded();
		if (!limit) return;

		const snapshot = this.snapshot;
		const detail: Record<BudgetLimit, string> = {
			maxSteps: `${snapshot.steps} steps > ${this.limits.maxSteps}`,
			maxTokens: `${snapshot.totalTokens} tokens > ${this.limits.maxTokens}`,
			maxCostUsd: `$${snapshot.costUsd.toFixed(4)} > $${this.limits.maxCostUsd}`,
			maxWallClockMs: `${snapshot.elapsedMs}ms elapsed > ${this.limits.maxWallClockMs}ms`,
		};
		throw new BudgetExceededError(limit, snapshot, detail[limit]);
	}

	/** The first limit passed, or `null`. Non-throwing, for logging a warning band. */
	exceeded(): BudgetLimit | null {
		const { maxSteps, maxTokens, maxCostUsd, maxWallClockMs } = this.limits;
		if (maxSteps !== undefined && this.steps > maxSteps) return 'maxSteps';
		if (maxTokens !== undefined && this.inputTokens + this.outputTokens > maxTokens) {
			return 'maxTokens';
		}
		if (maxCostUsd !== undefined && this.costUsd > maxCostUsd) return 'maxCostUsd';
		if (maxWallClockMs !== undefined && this.now() - this.startedAt > maxWallClockMs) {
			return 'maxWallClockMs';
		}
		return null;
	}

	get snapshot(): BudgetSnapshot {
		const totalTokens = this.inputTokens + this.outputTokens;
		const elapsedMs = this.now() - this.startedAt;
		const headroom = (limit: number | undefined, used: number) =>
			limit === undefined ? null : limit - used;

		return {
			steps: this.steps,
			inputTokens: this.inputTokens,
			outputTokens: this.outputTokens,
			totalTokens,
			costUsd: this.costUsd,
			elapsedMs,
			remaining: {
				steps: headroom(this.limits.maxSteps, this.steps),
				tokens: headroom(this.limits.maxTokens, totalTokens),
				costUsd: headroom(this.limits.maxCostUsd, this.costUsd),
				wallClockMs: headroom(this.limits.maxWallClockMs, elapsedMs),
			},
		};
	}
}
