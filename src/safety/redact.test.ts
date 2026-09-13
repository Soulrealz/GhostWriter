import { describe, it, expect } from 'vitest';
import { redact, redactDeep } from './redact.js';

const env = {
	GOOGLE_GENERATIVE_AI_API_KEY: 'AIzaSyD-fakefakefakefakefakefake01',
	NEO4J_PASSWORD: 'ghostwriter-local',
	LANGSMITH_TRACING: 'true',
	HOME: '/home/someone',
	SHORT_TOKEN: 'abc',
};

describe('redact', () => {
	it('replaces a secret-looking env value with a named marker', () => {
		const out = redact('calling with key AIzaSyD-fakefakefakefakefakefake01 now', { env });
		expect(out).toContain('[redacted:GOOGLE_GENERATIVE_AI_API_KEY]');
		expect(out).not.toContain('AIzaSyD-fakefakefakefakefakefake01');
		expect(out).toContain('calling with key');
	});

	it('redacts every occurrence', () => {
		const out = redact('ghostwriter-local / ghostwriter-local', { env });
		expect(out.match(/\[redacted:NEO4J_PASSWORD]/g)).toHaveLength(2);
	});

	it('ignores env vars that are not secret-shaped by name', () => {
		expect(redact('home is /home/someone', { env })).toContain('/home/someone');
	});

	it('ignores secret-named values too short to be a real secret', () => {
		expect(redact('value abc here', { env })).toContain('abc');
	});

	it('ignores non-secret values like a boolean flag', () => {
		expect(redact('tracing is true', { env })).toContain('true');
	});

	it.each([
		['sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAA', 'anthropic key'],
		['AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'google key'],
		['ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'github token'],
		['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdEFGH', 'jwt'],
	])('redacts %s by shape even when not in env (%s)', (secret) => {
		const out = redact(`token=${secret} end`, { env: {} });
		expect(out).not.toContain(secret);
		expect(out).toContain('[redacted]');
		expect(out).toContain('end');
	});

	it('redacts a bearer token but keeps the scheme', () => {
		const out = redact('authorization: Bearer abcdef1234567890abcdef', { env: {} });
		expect(out).toContain('Bearer [redacted]');
		expect(out).not.toContain('abcdef1234567890abcdef');
	});

	it('accepts extra secrets supplied by the caller', () => {
		const out = redact('the passphrase is hunter2hunter2', {
			env: {},
			secrets: ['hunter2hunter2'],
		});
		expect(out).toBe('the passphrase is [redacted]');
	});

	it('is idempotent', () => {
		const once = redact('key AIzaSyD-fakefakefakefakefakefake01', { env });
		expect(redact(once, { env })).toBe(once);
	});

	it('leaves clean text untouched', () => {
		expect(redact('nothing to see here', { env })).toBe('nothing to see here');
	});
});

describe('redactDeep', () => {
	it('walks strings inside objects and arrays', () => {
		const out = redactDeep(
			{ msg: 'pw ghostwriter-local', items: ['ghostwriter-local', 7], nested: { ok: true } },
			{ env },
		);
		expect(out).toEqual({
			msg: 'pw [redacted:NEO4J_PASSWORD]',
			items: ['[redacted:NEO4J_PASSWORD]', 7],
			nested: { ok: true },
		});
	});

	it('redacts secret-shaped object keys wholesale', () => {
		expect(redactDeep({ apiKey: 'whatever-it-is' }, { env: {} })).toEqual({ apiKey: '[redacted]' });
	});

	it('does not mutate its input', () => {
		const input = { msg: 'ghostwriter-local' };
		redactDeep(input, { env });
		expect(input.msg).toBe('ghostwriter-local');
	});

	it('keeps numeric values whose key merely contains a secret word', () => {
		// Regression: `inputTokens` matched /TOKEN/ and every usage count was
		// blanked, silently zeroing cost reporting. A credential is a string.
		expect(redactDeep({ usage: { inputTokens: 1420, outputTokens: 86 } }, { env: {} })).toEqual({
			usage: { inputTokens: 1420, outputTokens: 86 },
		});
	});

	it('still blanks a string value under a secret-shaped key', () => {
		expect(redactDeep({ accessToken: 'abcdefghijkl' }, { env: {} })).toEqual({
			accessToken: '[redacted]',
		});
	});

	it('keeps booleans under secret-shaped keys', () => {
		expect(redactDeep({ authEnabled: true }, { env: {} })).toEqual({ authEnabled: true });
	});

	it('passes through null and undefined', () => {
		expect(redactDeep(null, { env })).toBeNull();
		expect(redactDeep(undefined, { env })).toBeUndefined();
	});
});
