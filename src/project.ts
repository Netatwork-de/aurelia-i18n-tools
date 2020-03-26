import * as path from "path";
import decamelize = require("decamelize");
import { Config } from "./config";
import { Source } from "./source";
import { Diagnostics, Diagnostic } from "./diagnostics";
import { PairSet } from "./utility/pair-set";
import { TranslationData } from "./translation-data";
import { LocaleData } from "./locale-data";

export class Project {
	public readonly config: Config;
	public readonly diagnostics = new Diagnostics();
	public readonly development: boolean;

	/** A map of filenames to sources. */
	private readonly _sources = new Map<string, Source>();
	/** A pair set of filename/key pairs. */
	private readonly _knownKeys = new PairSet<string, string>();
	/** A set of filenames of sources that have not been justified yet. */
	private readonly _unprocessedSources = new Set<string>();
	/** A set of filenames of sources that have been modified in memory. */
	private readonly _modifiedSources = new Set<string>();
	/** An array of external locales. */
	private readonly _externalLocales: { localeId: string, data: LocaleData }[] = [];

	private _translationData = new TranslationData();
	private _translationDataModified = false;

	public constructor(options: ProjectOptions) {
		this.config = options.config;
		this.development = Boolean(options.development);
	}

	/**
	 * Get or set translation data.
	 * A task runner should set this property before processing sources if translation data exists on disk.
	 */
	public get translationData() {
		return this._translationData;
	}

	public set translationData(data: TranslationData) {
		this._translationData = data;
		this._translationDataModified = false;
	}

	/**
	 * Indicates if the translation data has been modified while processing sources.
	 * If so, a task runner should write the translation data to disk and set this property to false.
	 */
	public get translationDataModified() {
		return this._translationDataModified;
	}

	public set translationDataModified(modified: boolean) {
		this._translationDataModified = Boolean(modified);
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

	protected extractKeys(source: Source, prefix = this.getPrefix(source.filename)) {
		const keys = source.extractKeys(this.config, { prefix, diagnostics: this.diagnostics });
		this._knownKeys.deleteKey(source.filename);
		for (const key of keys.keys()) {
			this._knownKeys.add(source.filename, key);
		}
		this._translationData.updateKeys(source.filename, keys);
	}

	/**
	 * Should be called by a task runner to update or add a source file.
	 */
	public updateSource(source: Source) {
		const oldSource = this._sources.get(source.filename);
		this._sources.set(source.filename, source);
		if (!oldSource || oldSource.source !== source.source) {
			this._unprocessedSources.add(source.filename);
			this.extractKeys(source);
		}
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
						this.extractKeys(source, prefix);
						// TODO: apply replaced reserved keys to translation data.
						this._modifiedSources.add(filename);
					} else {
						this.diagnostics.report({
							type: Diagnostic.Type.ModifiedSource,
							details: {},
							filename
						});
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

	/**
	 * Add external locale data.
	 */
	public addExternalLocale(localeId: string, data: LocaleData) {
		this._externalLocales.push({ localeId, data });
	}

	/**
	 * Compile translation data and external locales.
	 * @returns A map of locale ids to compiled locale data.
	 */
	public compileLocales() {
		const locales = this._translationData.compile(this.config, this.diagnostics);
		for (const { localeId, data } of this._externalLocales) {
			const target = locales.get(localeId);
			if (target) {
				LocaleData.merge(target, data, this.diagnostics);
			} else {
				locales.set(localeId, data);
			}
		}
		return locales;
	}
}

export interface ProjectOptions {
	readonly config: Config;
	readonly development?: boolean;
}
