import { basename, dirname, extname, relative } from "node:path";

import { Config } from "./config.js";
import { Source } from "./source.js";
import { Diagnostics, Diagnostic, DiagnosticFormatter } from "./diagnostics.js";
import { PairSet } from "./utility/pair-set.js";
import { TranslationData } from "./translation-data.js";
import { LocaleData } from "./locale-data.js";
import { createMatchers, findFiles, joinPattern, watchFiles } from "./utility/file-system.js";
import { AureliaTemplateFile } from "./aurelia-template-file.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { JsonResourceFile } from "./json-resource-file.js";

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
	/** Map from locales to filenames to external locale data. */
	private readonly _externalLocales = new Map<string, Map<string, LocaleData>>();

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
		if (/^\.\.($|[\\\/])/.test(relative(this.config.src, filename))) {
			throw new Error(`Filename is outside of the project source directory: ${filename}`);
		}

		const ext = extname(filename);
		const name = basename(filename, ext);

		function sanitizeName(value: string) {
			return value
				.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
				.replace(/[^a-zA-Z0-9\.]+/, "-")
				.toLowerCase();
		}

		// Use the name of the directory as prefix if this is an index file not at the project root:
		if (name === "index") {
			const dir = dirname(filename);
			if (dir.length > this.config.src.length) {
				return `${this.config.prefix}${sanitizeName(basename(dir))}.`;
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
	public processSources() {
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
	public addExternalLocale(localeId: string, filename: string, data: LocaleData) {
		const entries = this._externalLocales.get(localeId);
		if (entries) {
			entries.set(filename, data);
		} else {
			this._externalLocales.set(localeId, new Map([[filename, data]]));
		}
	}

	/**
	 * Compile translation data and external locales.
	 * @returns A map of locale ids to compiled locale data.
	 */
	public compileLocales() {
		const locales = this._translationData.compile(this.config, this.diagnostics);
		for (const [localeId, files] of this._externalLocales) {
			for (const data of files.values()) {
				const target = locales.get(localeId);
				if (target) {
					LocaleData.merge(target, data, this.diagnostics);
				} else {
					locales.set(localeId, LocaleData.clone(data));
				}
			}
		}
		return locales;
	}

	/**
	 * Report all future diagnostics from this project to the console output.
	 *
	 * This will also set the process exit code to 1 if any errors are reported.
	 */
	public reportDiagnosticsToConsole() {
		this.diagnostics.on("report", diagnostic => {
			const handling = this.config.getDiagnosticHandling(diagnostic.type);
			if (handling === Config.DiagnosticHandling.Error) {
				process.exitCode = 1;
			} else if (handling !== Config.DiagnosticHandling.Ignore) {
				console.log(this.diagnosticFormatter.format(diagnostic));
			}
		});
	}

	/**
	 * Run the standard production or development workflow for this project.
	 */
	public async run(options?: ProjectRunOptions) {
		const sourcePatterns = [
			"**/*.html",
			"**/*.r.json",
		];

		const translationDataPath = this.config.translationData;
		const translationDataContext = dirname(translationDataPath);

		async function reloadTranslationData(this: Project) {
			try {
				this.translationData = TranslationData.parse(await readFile(translationDataPath, "utf-8"), translationDataContext);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
					throw error;
				}
			}
		}

		async function updateExternalLocale(this: Project, locale: string, filename: string) {
			const data = JSON.parse(await readFile(filename, "utf-8"));
			this.addExternalLocale(locale, filename, data);
		}

		async function updateSource(this: Project, filename: string) {
			const content = await readFile(filename, "utf-8");
			if (filename.endsWith(".html")) {
				this.updateSource(AureliaTemplateFile.parse(filename, content));
			} else {
				this.updateSource(JsonResourceFile.parse(filename, content));
			}
		}

		async function processUpdates(this: Project) {
			this.processSources();

			await this.handleModified({
				writeSource: async source => {
					await writeFile(source.filename, source.source);
				},
				writeTranslationData: async data => {
					await writeFile(translationDataPath, data.formatJson(translationDataContext));
				},
			});

			const locales = this.compileLocales();
			for (const [locale, data] of locales) {
				const filename = this.config.getOutputFilename(locale);
				await mkdir(dirname(filename), { recursive: true });
				await writeFile(filename, JSON.stringify(data), "utf-8");
			}
		}

		const watch = options?.watch ?? this.development;
		if (watch) {
			const externalLocaleMatchers = new Map(
				Object
					.entries(this.config.externalLocales)
					.map(([locale, patterns]) => [locale, createMatchers(this.config.context, patterns)])
			);

			watchFiles({
				cwd: this.config.context,
				patterns: [
					translationDataPath,
					...sourcePatterns.map(pattern => joinPattern(this.config.src, pattern)),
					...Object.values(this.config.externalLocales).flat(),
				],
				handleUpdates: async updates => {
					for (const filename of updates.deleted) {
						this.deleteSource(filename);
					}
					files: for (const filename of updates.updated) {
						if (filename === translationDataPath) {
							await reloadTranslationData.call(this);
							continue files;
						}
						for (const [locale, test] of externalLocaleMatchers) {
							if (test(filename)) {
								await updateExternalLocale.call(this, locale, filename);
								continue files;
							}
						}
						await updateSource.call(this, filename);
					}
					await processUpdates.call(this);
				},
			});
			return new Promise(() => {});
		} else {
			await reloadTranslationData.call(this);
			const sources = await findFiles(this.config.src, sourcePatterns);
			for (const filename of sources) {
				await updateSource.call(this, filename);
			}
			for (const locale in this.config.externalLocales) {
				const patterns = this.config.externalLocales[locale];
				const files = await findFiles(this.config.context, patterns);
				for (const filename of files) {
					await updateExternalLocale.call(this, locale, filename);
				}
			}
			await processUpdates.call(this);
		}
	}
}

export interface ProjectOptions {
	/** The project config. */
	readonly config: Config;
	/** True, to use the development workflow. */
	readonly development?: boolean;
}

export interface ProjectHandleModifiedHooks {
	readonly writeSource?: (source: Source) => void | Promise<void>;
	readonly writeTranslationData?: (data: TranslationData) => void | Promise<void>;
}

export interface ProjectRunOptions {
	/**
	 * If true, sources, translation data and external locales are watched for changes.
	 *
	 * Default is true in development mode and false in production mode.
	 */
	watch?: boolean;
}
