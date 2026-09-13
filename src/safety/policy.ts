import type { CommandPolicy } from './allowlist.js';

/**
 * The repo's default shell policy — the executable form of the boundaries table
 * in AGENTS.md §2. Build, test, lint, and read-only inspection verbs only.
 *
 * Deliberately absent: any interpreter (`node`, `npx`, `sh`, `python`), anything
 * that writes to git history, and anything that touches the network. Each of
 * those turns a single allowlist entry back into arbitrary execution.
 */
export const DEFAULT_COMMAND_POLICY: CommandPolicy = {
	allow: [
		'pnpm install',
		'pnpm test',
		'pnpm typecheck',
		'pnpm build',
		'pnpm coverage',
		'tsc --noEmit',
		'vitest run',
		'git status',
		'git diff',
		'git log',
		'git show',
		'ls',
		'cat',
		'head',
		'tail',
		'wc',
	],
};

const SECRET_PATH_PATTERNS: RegExp[] = [
	/^\.env(\..+)?$/i, // .env, .env.local, .env.production
	/^id_(rsa|dsa|ecdsa|ed25519)/i,
	/^secrets?(\..+)?$/i,
	/^credentials?(\..+)?$/i,
	/^\.(npmrc|netrc|pgpass|htpasswd)$/i,
	/\.(pem|key|pfx|p12|keystore|jks)$/i,
];

/** Example-only env files are documentation, not secrets. */
const SECRET_PATH_EXCEPTIONS = /^\.env\.(example|sample|template|defaults)$/i;

/**
 * Whether a path looks like credential material, judged per path *segment* so a
 * `secrets/` directory is caught but `secretsanta.md` is not.
 *
 * A belt-and-braces companion to `resolveWithinRoot`: that keeps the agent inside
 * the repo, this keeps it away from the sensitive files that live there.
 */
export function isSecretPath(path: string): boolean {
	const segments = path.split(/[/\\]+/).filter(Boolean);
	const basename = segments.at(-1) ?? '';

	if (SECRET_PATH_EXCEPTIONS.test(basename)) return false;
	if (SECRET_PATH_PATTERNS.some((pattern) => pattern.test(basename))) return true;

	// A parent directory named `secrets`/`credentials` taints everything under it.
	return segments
		.slice(0, -1)
		.some((segment) => /^(secrets?|credentials?|\.ssh|\.gnupg)$/i.test(segment));
}
