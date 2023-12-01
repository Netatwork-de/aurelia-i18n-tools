import * as posixPath from "node:path/posix";
import { readdir } from "node:fs/promises";

import { watch } from "chokidar";
import createMatcher, { Matcher, scan } from "picomatch";
import { join, normalize } from "node:path";

export interface WatchFileUpdates {
	initial: boolean;
	updated: string[];
	deleted: string[];
}

/**
 * Join a base path with a pattern.
 */
export function joinPattern(base: string, pattern: string) {
	return base.endsWith("/")
		? (pattern.endsWith("/") ? base + pattern.slice(1) : base + pattern)
		: pattern.endsWith("/") ? base + pattern : base + "/" + pattern;
}

function asPosixPath(path: string) {
	return path.replace(/\\/g, "/");
}

/**
 * Create a function that tests if a path matches any of the given patterns.
 */
export function createMatchers(cwd: string, patterns: string[]): (path: string) => boolean {
	cwd = asPosixPath(cwd);
	const matchers = patterns.map(pattern => createMatcher(pattern));
	return path => {
		const rel = posixPath.relative(cwd, asPosixPath(path));
		return matchers.some(matcher => matcher(rel));
	};
}

export interface WatchFileOptions {
	cwd: string;
	patterns: string[];
	handleUpdates: (updates: WatchFileUpdates) => Promise<void>;
	delay?: number;
}

/**
 * Watch for file system changes.
 *
 * This uses chokidar underneath.
 */
export function watchFiles(options: WatchFileOptions): void {
	const stabilityThreshold = options.delay ?? 100;
	const watcher = watch(options.patterns, {
		awaitWriteFinish: {
			pollInterval: stabilityThreshold	/ 2,
			stabilityThreshold,
		},
		cwd: options.cwd,
	});

	let current = Promise.resolve();
	function queue(updates: WatchFileUpdates) {
		current = current
			.then(() => options.handleUpdates(updates))
			.catch(error => {
				console.error(error);
				process.exitCode = 1;
			});
	}

	let ready = false;
	const initial: string[] = [];

	watcher.on("error", console.error);
	watcher.on("ready", () => {
		ready = true;
		queue({ initial: true, updated: initial, deleted: [] });
	});

	watcher.on("add", filename => {
		filename = join(options.cwd, filename);
		if (ready) {
			queue({ initial: false, updated: [filename], deleted: [] });
		} else {
			initial.push(filename);
		}
	});

	watcher.on("change", filename => {
		queue({ initial: false, updated: [join(options.cwd, filename)], deleted: [] });
	});

	watcher.on("unlink", filename => {
		queue({ initial: false, updated: [], deleted: [join(options.cwd, filename)] });
	});
}

/**
 * Find files matching the given patterns.
 *
 * This uses picomatch for matching which is also used internally by chokidar.
 *
 * @returns An array with absolute filenames.
 */
export async function findFiles(cwd: string, patterns: string[]): Promise<string[]> {
	cwd = asPosixPath(cwd);

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
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					return;
				}
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
