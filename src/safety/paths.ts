import { realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

/**
 * Thrown when a candidate path would resolve outside the agent's working root.
 * Callers should surface this to the model as a tool_result error, not throw it
 * out of the agent loop — the model can then correct the path itself.
 */
export class PathEscapeError extends Error {
	constructor(
		readonly candidate: string,
		reason: string,
	) {
		super(`refusing path ${JSON.stringify(candidate)}: ${reason}`);
		this.name = 'PathEscapeError';
	}
}

/**
 * Resolve `candidate` against `root` and guarantee the result stays inside it.
 *
 * Handles the three escapes a naive `path.join` misses:
 *   - `..` traversal, including absolute paths pointing elsewhere
 *   - symlinks whose target lives outside the root
 *   - sibling directories that merely share the root's string prefix
 *
 * Paths that do not exist yet are allowed (writes need that); the deepest
 * existing ancestor is what gets canonicalised.
 */
export function resolveWithinRoot(root: string, candidate: string): string {
	if (typeof candidate !== 'string' || candidate.trim() === '') {
		throw new PathEscapeError(candidate, 'path is empty');
	}
	if (candidate.includes('\0')) {
		throw new PathEscapeError(candidate, 'path contains a null byte');
	}

	const realRoot = canonicalise(resolve(root));
	const requested = isAbsolute(candidate) ? resolve(candidate) : resolve(realRoot, candidate);
	const resolved = canonicalise(requested);

	if (resolved !== realRoot && !resolved.startsWith(realRoot + sep)) {
		throw new PathEscapeError(candidate, `resolves to ${resolved}, outside ${realRoot}`);
	}
	return resolved;
}

/**
 * `fs.realpathSync` requires the whole path to exist. Walk up to the deepest
 * ancestor that does, canonicalise that, and re-attach the missing tail — so a
 * symlinked parent is still followed even when the leaf is yet to be created.
 */
function canonicalise(absolutePath: string): string {
	const tail: string[] = [];
	let current = absolutePath;

	for (;;) {
		try {
			return tail.length === 0 ? realpathSync(current) : join(realpathSync(current), ...tail);
		} catch {
			const parent = resolve(current, '..');
			if (parent === current) return absolutePath; // hit the filesystem root
			tail.unshift(current.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
			current = parent;
		}
	}
}
