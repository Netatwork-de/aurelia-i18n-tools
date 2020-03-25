import * as path from "path";
import decamelize = require("decamelize");
import { Config } from "./config";
import { Source } from "./source";
import { Diagnostics } from "./diagnostics";
import { PairSet } from "./utility/pair-set";

export class Project {
	public readonly config: Config;
	public readonly diagnostics = new Diagnostics();
	public readonly development: boolean;

	// A map of filenames to sources.
	private readonly _sources = new Map<string, Source>();
	// A pair set of filename/key pairs.
	private readonly _knownKeys = new PairSet<string, string>();
	// A set of filenames of sources that have not been justified yet.
	private readonly _unprocessedSources = new Set<string>();
	// A set of filenames of sources that have been modified in memory.
	private readonly _modifiedSources = new Set<string>();

	public constructor(options: ProjectOptions) {
		this.config = options.config;
		this.development = Boolean(options.development);
	}

	protected getPrefix(filename: string) {
		if (/^\.\.($|[\\\/])/.test(path.relative(this.config.src, filename))) {
			throw new Error(`Filename is outside of the project source directory: ${filename}`);
		}

		const ext = path.extname(filename);
		const name = path.basename(filename, ext);

		// Use the name of the directory as prefix if this is an index file not at the project root:
		if (name === "index") {
			const dirname = path.dirname(filename);
			if (dirname.length > this.config.src.length) {
				return `${this.config.prefix}${decamelize(path.basename(dirname), "-")}.t`;
			}
		}

		return `${this.config.prefix}${decamelize(name, "-")}.t`;
	}

	protected extractKnownKeys(source: Source, prefix = this.getPrefix(source.filename)) {
		const keys = source.extractKeys(this.config, { prefix, diagnostics: this.diagnostics });
		this._knownKeys.deleteKey(source.filename);
		for (const key of keys.keys()) {
			this._knownKeys.add(source.filename, key);
		}
	}

	// Workflow in production:
	// - All sources are added and keys are extracted.
	// - All sources are justified for diagnostics only.
	//   (Additional diagnostic is raised if source would have been modified)
	// - Translation data is compiled.
	//   (Additional diagnostic is raised if translation data would have been modified)
	// - Compiled translations are merged with translations from external packages.

	// Workflow in development:
	// - All (or changed) sources are added and keys are extracted.
	// - All (or changed) sources are justified.
	// - Changed sources are written to disk.
	// - Translation data is compiled and written to disk.
	// - Compiled translations are merged with translations from external packages.

	/**
	 * Should be called by a task runner to update or add a source file.
	 */
	public updateSource(source: Source) {
		this._sources.set(source.filename, source);
		this._unprocessedSources.add(source.filename);
		this.extractKnownKeys(source);
	}

	/**
	 * Can be called by a task runner to delete a source.
	 */
	public deleteSource(filename: string) {
		this._sources.delete(filename);
		this._unprocessedSources.delete(filename);
		this._knownKeys.deleteKey(filename);
		this._modifiedSources.delete(filename);
	}

	/**
	 * Should be called by a task runner to process updated sources.
	 */
	public processSources() {
		for (const filename of this._unprocessedSources) {
			this._unprocessedSources.delete(filename);
			const source = this._sources.get(filename)!;
			if (source.justifyKeys) {
				const prefix = this.getPrefix(filename);
				const result = source.justifyKeys(this.config, {
					prefix,
					diagnostics: this.diagnostics,
					diagnosticsOnly: !this.development,
					isReserved: key => {
						const filenames = this._knownKeys.getKeys(key);
						if (filenames) {
							return filenames.size > (filenames.has(filename) ? 1 : 0);
						}
						return false;
					}
				});
				if (result.modified) {
					if (this.development) {
						this.extractKnownKeys(source, prefix);
						// TODO: If translation data is available, apply replaced reserved keys.
						this._modifiedSources.add(filename);
					} else {
						// TODO: Report that source should have been justified in development.
					}
				}
			}
		}
	}

	/**
	 * Iterate through sources that have been modified in memory.
	 * This should be used by a task runner to write changed sources to disk.
	 */
	public * modifiedSources(): Generator<Source> {
		for (const filename of this._modifiedSources) {
			yield this._sources.get(filename)!;
		}
	}

	/**
	 * Mark a source as unmodified.
	 * This should be used by a task runner after the changes have been written to disk.
	 */
	public markUnmodified(filename: string) {
		this._modifiedSources.delete(filename);
	}
}

export interface ProjectOptions {
	readonly config: Config;
	readonly development?: boolean;
}
