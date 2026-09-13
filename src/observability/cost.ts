/**
 * Cost estimation, feeding `Budget`'s `maxCostUsd` ceiling.
 *
 * Prices are USD per million tokens, first-party Anthropic API rates. Bedrock and
 * Vertex are partner-operated and priced separately — pass `pricing` explicitly
 * for those.
 *
 * There is deliberately no entry for any model whose price is not verified here,
 * Gemini included: a wrong price silently under-reports a budget, which is worse
 * than a loud failure. `priceFor` returns null and `estimateCostUsd` throws;
 * callers with a price in hand pass it in.
 */

export interface ModelPricing {
	inputPerMTok: number;
	outputPerMTok: number;
}

/** Re-check against the provider pricing page when this goes stale. */
export const PRICING_CHECKED = '2026-06-24';
export const PRICING_SOURCE = 'https://www.anthropic.com/pricing';

export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = Object.freeze({
	'claude-fable-5-1': { inputPerMTok: 10, outputPerMTok: 50 },
	'claude-fable-5': { inputPerMTok: 10, outputPerMTok: 50 },
	'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25 },
	'claude-opus-4-8': { inputPerMTok: 5, outputPerMTok: 25 },
	'claude-opus-4-7': { inputPerMTok: 5, outputPerMTok: 25 },
	'claude-opus-4-6': { inputPerMTok: 5, outputPerMTok: 25 },
	'claude-sonnet-5': { inputPerMTok: 2, outputPerMTok: 10 },
	'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
	'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
});

/** Cache reads bill at roughly a tenth of the input rate, writes at 1.25x. */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export class UnknownModelError extends Error {
	constructor(readonly modelId: string) {
		super(
			`no verified pricing for ${JSON.stringify(modelId)}; ` +
				`pass pricing explicitly or add it to MODEL_PRICING (checked ${PRICING_CHECKED}, ${PRICING_SOURCE})`,
		);
		this.name = 'UnknownModelError';
	}
}

export interface TokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
}

/**
 * Look up a model, tolerating the two shapes a real id arrives in: a platform
 * prefix (`anthropic.claude-sonnet-5` on Bedrock) and a dated snapshot suffix
 * (`claude-haiku-4-5-20251001`).
 */
export function priceFor(modelId: string): ModelPricing | null {
	const bare = modelId.includes('.') ? (modelId.split('.').at(-1) ?? modelId) : modelId;
	return MODEL_PRICING[bare] ?? MODEL_PRICING[bare.replace(/-\d{8}$/, '')] ?? null;
}

export function estimateCostUsd(
	modelId: string,
	usage: TokenUsage,
	pricing?: ModelPricing,
): number {
	const price = pricing ?? priceFor(modelId);
	if (!price) throw new UnknownModelError(modelId);

	const perToken = (rate: number) => rate / 1_000_000;
	return (
		(usage.inputTokens ?? 0) * perToken(price.inputPerMTok) +
		(usage.outputTokens ?? 0) * perToken(price.outputPerMTok) +
		(usage.cacheReadTokens ?? 0) * perToken(price.inputPerMTok) * CACHE_READ_MULTIPLIER +
		(usage.cacheWriteTokens ?? 0) * perToken(price.inputPerMTok) * CACHE_WRITE_MULTIPLIER
	);
}

/**
 * Rough character-count heuristic, ~4 chars per token. Good enough for a
 * pre-flight "is this prompt obviously too big" check and nothing more — for a
 * real number use the provider's token-counting endpoint, which is exact and
 * tokeniser-aware.
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/** Agent runs live in fractions of a cent; `$0.00` for every step is useless. */
export function formatUsd(amount: number): string {
	return amount > 0 && amount < 0.01 ? `$${amount.toFixed(6)}` : `$${amount.toFixed(2)}`;
}
