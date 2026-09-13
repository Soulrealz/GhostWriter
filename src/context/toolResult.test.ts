import { describe, it, expect } from 'vitest';
import { truncateToolResult, previewJson, pickFields } from './toolResult.js';

describe('truncateToolResult', () => {
	it('returns short text unchanged', () => {
		expect(truncateToolResult('small', { maxChars: 100 })).toBe('small');
	});

	it('returns text exactly at the limit unchanged', () => {
		const text = 'x'.repeat(50);
		expect(truncateToolResult(text, { maxChars: 50 })).toBe(text);
	});

	it('keeps the head and the tail of long text', () => {
		const text = `START${'x'.repeat(500)}END`;
		const out = truncateToolResult(text, { maxChars: 100 });
		expect(out.startsWith('START')).toBe(true);
		expect(out.endsWith('END')).toBe(true);
	});

	it('states how much it dropped, so the model knows it is partial', () => {
		const out = truncateToolResult('x'.repeat(1000), { maxChars: 100 });
		expect(out).toMatch(/truncated/i);
		expect(out).toMatch(/1000/);
	});

	it('never exceeds maxChars by more than the marker', () => {
		const out = truncateToolResult('x'.repeat(10_000), { maxChars: 200 });
		expect(out.length).toBeLessThan(200 + 120);
	});

	it('honours a head-only strategy', () => {
		const out = truncateToolResult(`START${'x'.repeat(500)}END`, { maxChars: 100, tail: 0 });
		expect(out.startsWith('START')).toBe(true);
		expect(out.endsWith('END')).toBe(false);
	});

	it('handles an empty string', () => {
		expect(truncateToolResult('', { maxChars: 10 })).toBe('');
	});
});

describe('previewJson', () => {
	it('pretty-prints a small value', () => {
		expect(previewJson({ a: 1 })).toContain('"a": 1');
	});

	it('truncates a large value', () => {
		const big = { items: Array.from({ length: 500 }, (_, i) => ({ i, name: `item-${i}` })) };
		const out = previewJson(big, { maxChars: 300 });
		expect(out.length).toBeLessThan(500);
		expect(out).toMatch(/truncated/i);
	});

	it('survives a circular reference instead of throwing', () => {
		const circular: Record<string, unknown> = { name: 'loop' };
		circular.self = circular;
		expect(() => previewJson(circular)).not.toThrow();
		expect(previewJson(circular)).toMatch(/circular|loop/i);
	});

	it('renders undefined and functions without crashing', () => {
		expect(() => previewJson({ fn: () => 1, nothing: undefined })).not.toThrow();
	});
});

describe('pickFields', () => {
	const row = { id: 7, name: 'a.ts', bytes: 120, mtime: 'now', blob: 'x'.repeat(1000) };

	it('keeps only the requested fields', () => {
		expect(pickFields(row, ['id', 'name'])).toEqual({ id: 7, name: 'a.ts' });
	});

	it('skips fields that are absent', () => {
		expect(pickFields(row, ['id', 'missing' as keyof typeof row])).toEqual({ id: 7 });
	});

	it('does not mutate the source', () => {
		pickFields(row, ['id']);
		expect(Object.keys(row)).toHaveLength(5);
	});

	it('returns an empty object for an empty key list', () => {
		expect(pickFields(row, [])).toEqual({});
	});
});
