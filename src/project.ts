import * as path from "path";
import { Config } from "./config";
import { Source } from "./source";
import { Diagnostics, Diagnostic, DiagnosticFormatter } from "./diagnostics";
import { PairSet } from "./utility/pair-set";
import { TranslationData } from "./translation-data";
import { LocaleData } from "./locale-data";

export class Project {
	public readonly config: Config;
	public readonly diagnostics = new Diagnostics();
	public readonly diagnosticFormatter = new DiagnosticFormatter();
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
		this._translationDataModified = data.parsedVersion != 2;
	}

	public getPrefix(filename: string) {
		if (/^\.\.($|[\\\/])/.test(path.relative(this.config.src, filename))) {
			throw new Error(`Filename is outside of the project source directory: ${filename}`);
		}

		const ext = path.extname(filename);
		const name = path.basename(filename, ext);

		function sanitizeName(value: string) {
			return value
				.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
				.replace(/[^a-zA-Z0-9\.]+/, "-")
				.toLowerCase();
		}

		// Use the name of the directory as prefix if this is an index file not at the project root:
		if (name === "index") {
			const dirname = path.dirname(filename);
			if (dirname.length > this.config.src.length) {
				return `${this.config.prefix}${sanitizeName(path.basename(dirname))}.`;
			}
		}

		return `${this.config.prefix}${sanitizeName(name)}.`;
	}

	protected extractKeys(source: Source, prefix = this.getPrefix(source.filename)) {
		const keys = source.extractKeys(this.config, { prefix, diagnostics: this.diagnostics });
		this._knownKeys.deleteKey(source.filename);
		for (const key of keys.keys()) {
			this._knownKeys.add(source.filename, key);
		}
		if (this._translationData.updateKeys(source.filename, keys)) {
			this._translationDataModified = true;
		}
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
	public processSources(options: ProjectProcessSourcesOptions = {}) {
		for (const [filename, file] of this._translationData.files) {
			for (const key of file.content.keys()) {
				this._knownKeys.add(filename, key);
			}
		}
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
					},
					enforcePrefix: options.enforcePrefix
				});
				if (result.modified) {
					for (const [oldKey, newKeys] of result.replacedKeys) {
						for (const newKey of newKeys) {
							const hintFilenames = this._knownKeys.getKeys(oldKey);
							if (this._translationData.copyTranslations(filename, oldKey, newKey, hintFilenames)) {
								this._translationDataModified = true;
							}
						}
					}
					this.extractKeys(source, prefix);
					this._modifiedSources.add(filename);
				}
			}
		}
		for (const [filename, file] of this._translationData.files) {
			if (!this._sources.has(filename) || file.content.size === 0) {
				this._translationData.deleteFile(filename);
				this._translationDataModified = true;
			}
		}
	}

	/**
	 * Handle modified sources and translation data.
	 *
	 * This should be called by a task runner after sources have been processed.
	 *
	 * In prorudction, no hooks will be invoked and diagnostics
	 * are reported if anything has been modified.
	 */
	public async handleModified(hooks: ProjectHandleModifiedHooks) {
		if (this.development) {
			const writeTasks: (void | Promise<void>)[] = [];

			for (const filename of this._modifiedSources) {
				this._modifiedSources.delete(filename);
				if (hooks.writeSource) {
					writeTasks.push(hooks.writeSource(this._sources.get(filename)!));
				}
			}

			if (this._translationDataModified) {
				this._translationDataModified = false;
				if (hooks.writeTranslationData) {
					writeTasks.push(hooks.writeTranslationData(this._translationData));
				}
			}

			await Promise.all(writeTasks);
		} else {
			for (const filename of this._modifiedSources) {
				this.diagnostics.report({
					type: Diagnostic.Type.ModifiedSource,
					details: {},
					filename
				});
			}
			if (this._translationDataModified) {
				this.diagnostics.report({
					type: Diagnostic.Type.ModifiedTranslation,
					details: {}
				});
			}
		}
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
				locales.set(localeId, LocaleData.clone(data));
			}
		}
		return locales;
	}
}

export interface ProjectOptions {
	/** The project config. */
	readonly config: Config;
	/** True, to use the development workflow. */
	readonly development?: boolean;
}

export interface ProjectProcessSourcesOptions {
	/** If true, keys not starting with the specified prefix are replaced. */
	readonly enforcePrefix?: boolean;
}

export interface ProjectHandleModifiedHooks {
	readonly writeSource?: (source: Source) => void | Promise<void>;
	readonly writeTranslationData?: (data: TranslationData) => void | Promise<void>;
}
