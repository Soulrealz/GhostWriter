/**
 * Secret redaction for anything leaving the process: trace logs, tool results,
 * error messages, and prompts.
 *
 * Two layers, because either alone leaks. Env-value matching catches *this*
 * machine's real secrets exactly; shape matching catches keys that were never in
 * the environment — pasted into a task, read out of a file, echoed by a command.
 */

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|SESSION|COOKIE)/i;

/** Below this length a value is too generic to blank out without mangling text. */
const MIN_SECRET_LENGTH = 8;

const SECRET_SHAPES: RegExp[] = [
	/sk-ant-[A-Za-z0-9\-_]{16,}/g, // Anthropic
	/AIza[0-9A-Za-z\-_]{20,}/g, // Google
	/gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub
	/xox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
	/sk-[A-Za-z0-9]{20,}/g, // OpenAI-style
	/lsv2_[a-z]{2}_[A-Za-z0-9]{20,}/g, // LangSmith
	/e2b_[A-Za-z0-9]{20,}/g, // E2B
	/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];

const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]{12,}=*/gi;

export interface RedactOptions {
	/** Environment to source secret values from. Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** Additional literal values to blank out. */
	secrets?: string[];
}

export function redact(text: string, options: RedactOptions = {}): string {
	if (typeof text !== 'string' || text.length === 0) return text;
	const env = options.env ?? process.env;
	let out = text;

	// Named first: a marker like [redacted:NEO4J_PASSWORD] is far easier to debug
	// against than an anonymous [redacted].
	for (const [name, value] of Object.entries(env)) {
		if (!value || value.length < MIN_SECRET_LENGTH || !SECRET_NAME.test(name)) continue;
		out = out.split(value).join(`[redacted:${name}]`);
	}

	for (const secret of options.secrets ?? []) {
		if (secret.length > 0) out = out.split(secret).join('[redacted]');
	}

	for (const shape of SECRET_SHAPES) out = out.replace(shape, '[redacted]');
	out = out.replace(BEARER, (_match, scheme: string) => `${scheme} [redacted]`);

	return out;
}

/**
 * Redact every string in a structure, and blank any value whose *key* is
 * secret-shaped regardless of the value's form. Returns a copy.
 */
export function redactDeep<T>(value: T, options: RedactOptions = {}): T {
	return walk(value, options) as T;
}

function walk(value: unknown, options: RedactOptions): unknown {
	if (typeof value === 'string') return redact(value, options);
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map((item) => walk(item, options));

	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		// Key-based blanking applies to strings only. A credential is a string;
		// `{inputTokens: 1420}` matches /TOKEN/ but blanking it would silently
		// destroy usage counts — and with them every cost report downstream.
		out[key] = typeof item === 'string' && SECRET_NAME.test(key) ? '[redacted]' : walk(item, options);
	}
	return out;
}
