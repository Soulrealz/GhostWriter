import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { withTempWorkspace, SAMPLE_REPO } from './workspace.js';

describe('SAMPLE_REPO', () => {
	it('points at a fixture that exists', () => {
		expect(existsSync(SAMPLE_REPO)).toBe(true);
		expect(existsSync(join(SAMPLE_REPO, 'package.json'))).toBe(true);
	});
});

describe('withTempWorkspace', () => {
	it('copies the fixture into a fresh directory', async () => {
		await withTempWorkspace(SAMPLE_REPO, (dir) => {
			expect(dir).not.toBe(SAMPLE_REPO);
			expect(existsSync(join(dir, 'src', 'math.js'))).toBe(true);
			expect(existsSync(join(dir, 'test', 'math.test.js'))).toBe(true);
		});
	});

	it('returns whatever the callback returns', async () => {
		expect(await withTempWorkspace(SAMPLE_REPO, () => 'done')).toBe('done');
	});

	it('awaits an async callback', async () => {
		expect(
			await withTempWorkspace(SAMPLE_REPO, async (dir) => readdirSync(dir).length),
		).toBeGreaterThan(0);
	});

	it('isolates writes from the original fixture', async () => {
		const before = readFileSync(join(SAMPLE_REPO, 'src', 'math.js'), 'utf8');
		await withTempWorkspace(SAMPLE_REPO, (dir) => {
			writeFileSync(join(dir, 'src', 'math.js'), 'export const wrecked = true;\n');
		});
		expect(readFileSync(join(SAMPLE_REPO, 'src', 'math.js'), 'utf8')).toBe(before);
	});

	it('gives each call its own directory', async () => {
		const seen: string[] = [];
		await withTempWorkspace(SAMPLE_REPO, (dir) => void seen.push(dir));
		await withTempWorkspace(SAMPLE_REPO, (dir) => void seen.push(dir));
		expect(seen[0]).not.toBe(seen[1]);
	});

	it('cleans up afterwards', async () => {
		let captured = '';
		await withTempWorkspace(SAMPLE_REPO, (dir) => void (captured = dir));
		expect(existsSync(captured)).toBe(false);
	});

	it('cleans up even when the callback throws, and rethrows', async () => {
		let captured = '';
		await expect(
			withTempWorkspace(SAMPLE_REPO, (dir) => {
				captured = dir;
				throw new Error('agent exploded');
			}),
		).rejects.toThrow('agent exploded');
		expect(existsSync(captured)).toBe(false);
	});

	it('keeps the directory when asked, for post-mortem inspection', async () => {
		let captured = '';
		await withTempWorkspace(SAMPLE_REPO, (dir) => void (captured = dir), { keep: true });
		expect(existsSync(captured)).toBe(true);
		const { rmSync } = await import('node:fs');
		rmSync(captured, { recursive: true, force: true });
	});

	it('rejects a fixture path that does not exist', async () => {
		await expect(withTempWorkspace('/nope/not/here', () => 1)).rejects.toThrow(/not.*exist|ENOENT/i);
	});
});
