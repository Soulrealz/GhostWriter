import { describe, it, expect } from 'vitest';
import { DEFAULT_COMMAND_POLICY, isSecretPath } from './policy.js';
import { assertCommandAllowed, CommandDeniedError } from './allowlist.js';

describe('DEFAULT_COMMAND_POLICY', () => {
	it.each(['pnpm test', 'pnpm typecheck', 'pnpm build', 'git status', 'git diff --stat'])(
		'allows the verification command %j',
		(command) => {
			expect(() => assertCommandAllowed(command, DEFAULT_COMMAND_POLICY)).not.toThrow();
		},
	);

	it.each(['git push origin master', 'git commit -m x', 'rm -rf node_modules', 'curl example.com'])(
		'denies the mutating or outbound command %j',
		(command) => {
			expect(() => assertCommandAllowed(command, DEFAULT_COMMAND_POLICY)).toThrow(
				CommandDeniedError,
			);
		},
	);

	it('contains no entry that would re-enable a shell', () => {
		for (const entry of DEFAULT_COMMAND_POLICY.allow) {
			expect(entry).not.toMatch(/^(sh|bash|zsh|env|eval|node|npx)\b/);
		}
	});
});

describe('isSecretPath', () => {
	it.each([
		'.env',
		'.env.local',
		'config/.env.production',
		'certs/server.pem',
		'.ssh/id_rsa',
		'id_ed25519',
		'secrets.json',
		'src/secrets/keys.ts',
		'deploy.key',
		'.npmrc',
		'credentials.yaml',
	])('flags %j', (path) => {
		expect(isSecretPath(path)).toBe(true);
	});

	it.each([
		'src/index.ts',
		'.env.example',
		'README.md',
		'src/safety/policy.ts',
		'environment.ts',
		'docs/secretsanta.md',
	])('does not flag %j', (path) => {
		expect(isSecretPath(path)).toBe(false);
	});

	it('is case-insensitive on the filename', () => {
		expect(isSecretPath('Secrets.JSON')).toBe(true);
	});

	it('handles windows-style separators', () => {
		expect(isSecretPath('config\\.env')).toBe(true);
	});
});
