/**
 * Command policy for the agent's shell tool.
 *
 * Each `allow` entry is an argv prefix, matched token-by-token — `"pnpm test"`
 * permits `pnpm test --run x` but not `pnpm testify` and not `git push`.
 */
export interface CommandPolicy {
	allow: string[];
}

export class CommandDeniedError extends Error {
	constructor(
		readonly command: string,
		reason: string,
	) {
		super(`refusing command ${JSON.stringify(command)}: ${reason}`);
		this.name = 'CommandDeniedError';
	}
}

/**
 * Shell operators are rejected outright rather than escaped. Anything that can
 * chain, redirect, substitute, or background a second command turns one allowed
 * entry into arbitrary execution, so the safe set is "no shell at all" — run the
 * returned argv with `execFile`, never `exec`.
 */
const SHELL_METACHARACTERS = /[;&|`$><()\n\r\\!*?{}[\]~#]/;

/**
 * Validate `command` against `policy` and return its argv.
 *
 * Throws `CommandDeniedError` rather than returning a boolean so a caller cannot
 * forget to check the result; tool handlers should catch it and hand the message
 * back to the model as a tool_result error.
 */
export function assertCommandAllowed(command: string, policy: CommandPolicy): string[] {
	if (typeof command !== 'string' || command.trim() === '') {
		throw new CommandDeniedError(command, 'command is empty');
	}
	if (SHELL_METACHARACTERS.test(command)) {
		throw new CommandDeniedError(command, 'command contains shell metacharacters');
	}

	const argv = tokenise(command);
	if (argv.length === 0) {
		throw new CommandDeniedError(command, 'command is empty');
	}

	const matched = policy.allow.some((entry) => {
		const prefix = entry.trim().split(/\s+/);
		return prefix.length <= argv.length && prefix.every((token, i) => argv[i] === token);
	});
	if (!matched) {
		throw new CommandDeniedError(command, 'no allowlist entry matches this argv prefix');
	}
	return argv;
}

/** Whitespace split that keeps quoted runs together. No escapes — `\` is already rejected. */
function tokenise(command: string): string[] {
	const tokens: string[] = [];
	let token = '';
	let quote: '"' | "'" | null = null;
	let started = false;

	for (const char of command) {
		if (quote) {
			if (char === quote) quote = null;
			else token += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			started = true;
			continue;
		}
		if (/\s/.test(char)) {
			if (started) tokens.push(token);
			token = '';
			started = false;
			continue;
		}
		token += char;
		started = true;
	}

	if (quote) throw new CommandDeniedError(command, 'unterminated quote');
	if (started) tokens.push(token);
	return tokens;
}
