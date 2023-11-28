import * as posixPath from "node:path/posix";
import { readdir } from "node:fs/promises";

import { watch } from "chokidar";
import createMatcher, { Matcher, scan } from "picomatch";
import { normalize } from "node:path";

export interface WatchFileUpdates {
	initial: boolean;
	updated: string[];
	deleted: string[];
}

/**
 * Watch for file system changes.
 *
 * This uses chokidar underneath.
 */
export function watchFiles(cwd: string, patterns: string[], fn: (updates: WatchFileUpdates) => void): void {
	const watcher = watch(patterns, {
		awaitWriteFinish: true,
		cwd,
	});

	let ready = false;
	const initial: string[] = [];

	watcher.on("error", console.error);
	watcher.on("ready", () => {
		ready = true;
		fn({ initial: true, updated: initial, deleted: [] });
	});

	watcher.on("add", filename => {
		if (ready) {
			fn({ initial: false, updated: [filename], deleted: [] })
		} else {
			initial.push(filename);
		}
	});

	watcher.on("change", filename => {
		fn({ initial: false, updated: [filename], deleted: [] });
	});

	watcher.on("unlink", filename => {
		fn({ initial: false, updated: [], deleted: [filename] });
	});
}

/**
 * Find files matching the given patterns.
 *
 * This uses picomatch for matching which is also used internally by chokidar.
 *
 * @returns An array with absolute filenames.
 */
export async function findFiles(cwd: string, patterns: string[], debug = false): Promise<string[]> {
	// Picomatch only supports posix paths:
	cwd = cwd.replace(/\\/g, "/");

	const matchers: Matcher[] = [];
	let bases: string[] = [];
	for (const pattern of patterns) {
		matchers.push(createMatcher(pattern));
		const base = posixPath.join(cwd, scan(pattern).base);
		if (!bases.some(path => isOrContains(path, base))) {
			bases = bases.filter(path => !isOrContains(base, path));
			bases.push(base);
		}
	}

	function isOrContains(parent: string, nested: string): boolean {
		return parent === nested || (nested.startsWith(parent) && nested[parent.length] === "/");
	}

	const filenames: string[] = [];
	for (const base of bases) {
		await (function walk(path: string) {
			return readdir(path).then(async names => {
				for (const name of names) {
					await walk(posixPath.join(path, name));
				}
			}, error => {
				if ((error as NodeJS.ErrnoException).code !== "ENOTDIR") {
					throw error;
				}
				const rel = posixPath.relative(cwd, path);
				if (matchers.some(matcher => matcher(rel))) {
					filenames.push(normalize(path));
				}
			});
		})(base);
	}
	return filenames;
}
