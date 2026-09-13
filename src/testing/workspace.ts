import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Disposable copies of a fixture repo for agent runs.
 *
 * An agent that edits files needs somewhere to edit. Pointing it at the fixture
 * itself means the second run starts from the first run's output, which makes
 * every result unreproducible — so each run gets a fresh copy in a temp dir and
 * the fixture stays pristine.
 *
 * The copy doubles as the containment boundary in practice: pass the temp dir as
 * the root to `resolveWithinRoot`, and a path-escape bug damages a throwaway
 * directory rather than your repo.
 */

/** ESM has no `__dirname`; derive it from the module URL. */
const HERE = dirname(fileURLToPath(import.meta.url));

/** Zero-dependency target repo — `npm test` runs Node's built-in runner. */
export const SAMPLE_REPO = resolve(HERE, '..', '..', 'fixtures', 'sample-repo');

export interface WorkspaceOptions {
	/** Leave the directory on disk after the callback, to inspect what an agent did. */
	keep?: boolean;
	/** Prefix for the temp directory name. */
	prefix?: string;
}

export async function withTempWorkspace<T>(
	fixtureDir: string,
	fn: (dir: string) => T | Promise<T>,
	options: WorkspaceOptions = {},
): Promise<T> {
	if (!existsSync(fixtureDir)) {
		throw new Error(`fixture does not exist: ${fixtureDir}`);
	}

	const dir = mkdtempSync(join(tmpdir(), options.prefix ?? 'ghostwriter-ws-'));
	cpSync(fixtureDir, dir, { recursive: true });

	try {
		return await fn(dir);
	} finally {
		// `keep` is for debugging a failed run; everything else is cleaned up even
		// when the callback throws, or a crashed agent leaves temp dirs behind.
		if (!options.keep) rmSync(dir, { recursive: true, force: true });
	}
}
