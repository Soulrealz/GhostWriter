import { describe, it, expect } from 'vitest';
import {
	MODEL_PRICING,
	PRICING_CHECKED,
	priceFor,
	estimateCostUsd,
	estimateTokens,
	formatUsd,
	UnknownModelError,
} from './cost.js';

describe('priceFor', () => {
	it('finds a model by exact id', () => {
		expect(priceFor('claude-opus-5')).toEqual({ inputPerMTok: 5, outputPerMTok: 25 });
	});

	it('strips a dated snapshot suffix', () => {
		expect(priceFor('claude-haiku-4-5-20251001')).toEqual(MODEL_PRICING['claude-haiku-4-5']);
	});

	it('strips a platform prefix', () => {
		expect(priceFor('anthropic.claude-sonnet-5')).toEqual(MODEL_PRICING['claude-sonnet-5']);
	});

	it('returns null for a model it has no verified price for', () => {
		expect(priceFor('gemini-2.5-flash')).toBeNull();
		expect(priceFor('some-future-model')).toBeNull();
	});

	it('ships a date saying when the table was last checked', () => {
		expect(PRICING_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('has positive prices with output dearer than input for every entry', () => {
		for (const [id, price] of Object.entries(MODEL_PRICING)) {
			expect(price.inputPerMTok, id).toBeGreaterThan(0);
			expect(price.outputPerMTok, id).toBeGreaterThan(price.inputPerMTok);
		}
	});
});

describe('estimateCostUsd', () => {
	it('prices input and output separately', () => {
		// 1M in at $5, 1M out at $25.
		expect(estimateCostUsd('claude-opus-5', { inputTokens: 1e6, outputTokens: 1e6 })).toBeCloseTo(
			30,
			6,
		);
	});

	it('scales down to realistic step sizes', () => {
		const cost = estimateCostUsd('claude-haiku-4-5', { inputTokens: 2000, outputTokens: 500 });
		expect(cost).toBeCloseTo(2000 / 1e6 + (500 * 5) / 1e6, 9);
	});

	it('charges cache reads at a tenth of input', () => {
		const cached = estimateCostUsd('claude-opus-5', { cacheReadTokens: 1e6 });
		expect(cached).toBeCloseTo(0.5, 6);
	});

	it('charges cache writes at 1.25x input', () => {
		expect(estimateCostUsd('claude-opus-5', { cacheWriteTokens: 1e6 })).toBeCloseTo(6.25, 6);
	});

	it('is zero for empty usage', () => {
		expect(estimateCostUsd('claude-opus-5', {})).toBe(0);
	});

	it('throws on an unpriced model rather than guessing zero', () => {
		expect(() => estimateCostUsd('gemini-2.5-flash', { inputTokens: 100 })).toThrow(
			UnknownModelError,
		);
	});

	it('accepts caller-supplied pricing for a model not in the table', () => {
		const cost = estimateCostUsd(
			'gemini-2.5-flash',
			{ inputTokens: 1e6 },
			{ inputPerMTok: 0.3, outputPerMTok: 2.5 },
		);
		expect(cost).toBeCloseTo(0.3, 6);
	});

	it('names the model in the error so the fix is obvious', () => {
		expect(() => estimateCostUsd('mystery-model', { inputTokens: 1 })).toThrow(/mystery-model/);
	});
});

describe('estimateTokens', () => {
	it('is roughly a quarter of the character count', () => {
		expect(estimateTokens('x'.repeat(400))).toBe(100);
	});

	it('is zero for empty text', () => {
		expect(estimateTokens('')).toBe(0);
	});

	it('never returns a fraction', () => {
		expect(Number.isInteger(estimateTokens('abc'))).toBe(true);
	});
});

describe('formatUsd', () => {
	it('keeps sub-cent amounts legible', () => {
		expect(formatUsd(0.00042)).toBe('$0.000420');
	});

	it('uses two decimals once past a cent', () => {
		expect(formatUsd(12.3456)).toBe('$12.35');
	});

	it('renders zero plainly', () => {
		expect(formatUsd(0)).toBe('$0.00');
	});
});
