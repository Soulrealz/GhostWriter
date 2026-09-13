import { describe, it, expect } from 'vitest';
import { Budget, BudgetExceededError } from './budget.js';

/** Injectable clock so wall-clock limits are deterministic. */
function fakeClock(start = 0) {
	let now = start;
	return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('Budget', () => {
	it('records steps and usage in its snapshot', () => {
		const budget = new Budget({ maxSteps: 10 });
		budget.recordStep({ inputTokens: 100, outputTokens: 20, costUsd: 0.002 });
		budget.recordStep({ inputTokens: 50, outputTokens: 10, costUsd: 0.001 });

		expect(budget.snapshot).toMatchObject({ steps: 2, inputTokens: 150, outputTokens: 30 });
		expect(budget.snapshot.totalTokens).toBe(180);
		expect(budget.snapshot.costUsd).toBeCloseTo(0.003, 6);
	});

	it('allows a step with no usage reported', () => {
		const budget = new Budget({ maxSteps: 2 });
		budget.recordStep();
		expect(budget.snapshot.steps).toBe(1);
	});

	it('throws once the step limit is passed, not when it is reached', () => {
		const budget = new Budget({ maxSteps: 2 });
		budget.recordStep();
		budget.recordStep();
		expect(() => budget.recordStep()).toThrow(BudgetExceededError);
	});

	it('throws on the token ceiling', () => {
		const budget = new Budget({ maxTokens: 100 });
		expect(() => budget.recordStep({ inputTokens: 80, outputTokens: 40 })).toThrow(
			BudgetExceededError,
		);
	});

	it('throws on the cost ceiling', () => {
		const budget = new Budget({ maxCostUsd: 0.5 });
		expect(() => budget.recordStep({ costUsd: 0.6 })).toThrow(/cost/i);
	});

	it('throws on the wall-clock ceiling', () => {
		const clock = fakeClock();
		const budget = new Budget({ maxWallClockMs: 1000 }, { now: clock.now });
		clock.advance(1500);
		expect(() => budget.assertWithinLimits()).toThrow(/wall.clock|elapsed/i);
	});

	it('still records the step that broke the budget, so the report is truthful', () => {
		const budget = new Budget({ maxTokens: 10 });
		expect(() => budget.recordStep({ inputTokens: 100 })).toThrow();
		expect(budget.snapshot.inputTokens).toBe(100);
	});

	it('names the limit that was hit', () => {
		const budget = new Budget({ maxSteps: 1 });
		budget.recordStep();
		try {
			budget.recordStep();
			expect.unreachable('should have thrown');
		} catch (error) {
			expect(error).toBeInstanceOf(BudgetExceededError);
			expect((error as BudgetExceededError).limit).toBe('maxSteps');
		}
	});

	it('reports exceeded() without throwing', () => {
		const budget = new Budget({ maxSteps: 1 });
		expect(budget.exceeded()).toBeNull();
		budget.recordStep();
		expect(budget.exceeded()).toBeNull();
		expect(() => budget.recordStep()).toThrow();
		expect(budget.exceeded()).toBe('maxSteps');
	});

	it('treats an empty limit set as unbounded', () => {
		const budget = new Budget({});
		for (let i = 0; i < 100; i++) budget.recordStep({ inputTokens: 1_000_000 });
		expect(budget.exceeded()).toBeNull();
	});

	it('exposes remaining headroom for the caller to log', () => {
		const budget = new Budget({ maxSteps: 5, maxTokens: 1000 });
		budget.recordStep({ inputTokens: 200 });
		expect(budget.snapshot.remaining).toMatchObject({ steps: 4, tokens: 800 });
	});

	it('reports elapsed time from the injected clock', () => {
		const clock = fakeClock(500);
		const budget = new Budget({}, { now: clock.now });
		clock.advance(250);
		expect(budget.snapshot.elapsedMs).toBe(250);
	});
});
