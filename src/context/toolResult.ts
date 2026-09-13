/**
 * Context-window hygiene for tool results (AGENTS.md §1.2).
 *
 * Every tool result is appended to the conversation and re-sent on every
 * subsequent request, so an unbounded result is not a one-off cost — it is paid
 * again on each turn for the rest of the run, and it pushes the instructions
 * that matter toward the middle of the window where models attend worst.
 */

export interface TruncateOptions {
	/** Character budget for the content itself, marker excluded. Default 2000. */
	maxChars?: number;
	/** Characters kept from the end. Default: a third of the budget. 0 for head-only. */
	tail?: number;
}

export function truncateToolResult(text: string, options: TruncateOptions = {}): string {
	const maxChars = options.maxChars ?? 2000;
	if (text.length <= maxChars) return text;

	const tailChars = Math.min(options.tail ?? Math.floor(maxChars / 3), maxChars);
	const headChars = maxChars - tailChars;
	const dropped = text.length - maxChars;
	// Say what was cut and how much: a model that knows its view is partial will
	// ask for the rest, where one handed a silently clipped file will not.
	const marker = `\n… [truncated ${dropped} of ${text.length} characters] …\n`;

	return tailChars === 0
		? text.slice(0, headChars) + marker
		: text.slice(0, headChars) + marker + text.slice(-tailChars);
}

export interface PreviewOptions extends TruncateOptions {
	/** Indent for JSON.stringify. Default 2. */
	indent?: number;
}

/** Render any value for a tool result or a log line, without ever throwing. */
export function previewJson(value: unknown, options: PreviewOptions = {}): string {
	const seen = new WeakSet<object>();
	let text: string;

	try {
		text =
			JSON.stringify(
				value,
				(_key, item: unknown) => {
					if (typeof item === 'function') return '[function]';
					if (typeof item === 'bigint') return item.toString();
					if (item && typeof item === 'object') {
						if (seen.has(item)) return '[circular]';
						seen.add(item);
					}
					return item;
				},
				options.indent ?? 2,
			) ?? String(value);
	} catch (error) {
		text = `[unserialisable: ${error instanceof Error ? error.message : String(error)}]`;
	}

	return truncateToolResult(text, options);
}

/**
 * Project an object down to the fields the model actually needs. Absent keys are
 * dropped rather than emitted as `undefined`, so the serialised result stays
 * clean.
 */
export function pickFields<T extends object, K extends keyof T>(source: T, keys: K[]): Partial<T> {
	const out: Partial<T> = {};
	for (const key of keys) {
		if (Object.hasOwn(source, key)) out[key] = source[key];
	}
	return out;
}
