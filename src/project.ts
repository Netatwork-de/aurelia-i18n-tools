import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative } from "node:path";
import { AureliaTemplateFile } from "./aurelia-template-file.js";
import { Config } from "./config.js";
import { Diagnostic, DiagnosticFormatter, Diagnostics } from "./diagnostics.js";
import { JsonResourceFile } from "./json-resource-file.js";
import { LocaleData } from "./locale-data.js";
import { Source } from "./source.js";
import { TranslationData } from "./translation-data.js";
import { deduplicateModuleFilenames, findFiles, joinPattern, watchFiles } from "./utility/file-system.js";
import { PairSet } from "./utility/pair-set.js";

export class Project {
	#config: Config;
	#development: boolean;
	#diagnostics = new Diagnostics();
	#diagnosticFormatter = new DiagnosticFormatter();

	/** A map of filenames to sources. */
	#sources = new Map<string, Source>();
	/** A pair set of filename/key pairs. */
	#knownKeys = new PairSet<string, string>();
	/** A set of filenames of sources that have not been justified yet. */
	#unprocessedSources = new Set<string>();
	/** A set of filenames of sources that have been modified in memory. */
	#modifiedSources = new Set<string>();
	/** Map from locales to filenames to external locale data. */
	#externalLocales = new Map<string, Map<string, LocaleData>>();

	#translationData = new TranslationData();
	#translationDataModified = false;

	constructor(options: ProjectOptions) {
		this.#config = options.config;
		this.#development = Boolean(options.development);
	}

	get config() {
		return this.#config;
	}

	get diagnostics() {
		return this.#diagnostics;
	}

	get diagnosticFormatter() {
		return this.#diagnosticFormatter;
	}

	get development() {
		return this.#development;
	}

	/**
	 * Get or set translation data.
	 * A task runner should set this property before processing sources if translation data exists on disk.
	 */
	get translationData() {
		return this.#translationData;
	}

	set translationData(data: TranslationData) {
		this.#translationData = data;
		this.#translationDataModified = data.parsedVersion != 2;
	}

	getPrefix(filename: string) {
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

	#extractKeys(source: Source, prefix = this.getPrefix(source.filename)) {
		const keys = source.extractKeys(this.config, { prefix, diagnostics: this.diagnostics });
		this.#knownKeys.deleteKey(source.filename);
		for (const key of keys.keys()) {
			this.#knownKeys.add(source.filename, key);
		}
		if (this.#translationData.updateKeys(source.filename, keys)) {
			this.#translationDataModified = true;
		}
	}

	/**
	 * Should be called by a task runner to update or add a source file.
	 */
	updateSource(source: Source) {
		const oldSource = this.#sources.get(source.filename);
		this.#sources.set(source.filename, source);
		if (!oldSource || oldSource.source !== source.source) {
			this.#unprocessedSources.add(source.filename);
			this.#extractKeys(source);
		}
	}

	/**
	 * Can be called by a task runner to delete a source.
	 */
	deleteSource(filename: string) {
		this.#sources.delete(filename);
		this.#unprocessedSources.delete(filename);
		this.#knownKeys.deleteKey(filename);
		this.#modifiedSources.delete(filename);
	}

	/**
	 * Should be called by a task runner to process updated sources.
	 */
	processSources() {
		for (const [filename, file] of this.#translationData.files) {
			for (const key of file.content.keys()) {
				this.#knownKeys.add(filename, key);
			}
		}
		for (const filename of this.#unprocessedSources) {
			this.#unprocessedSources.delete(filename);
			const source = this.#sources.get(filename)!;
			if (source.justifyKeys) {
				const prefix = this.getPrefix(filename);
				const result = source.justifyKeys(this.config, {
					prefix,
					diagnostics: this.diagnostics,
					diagnosticsOnly: !this.development,
					isReserved: key => {
						const filenames = this.#knownKeys.getKeys(key);
						if (filenames) {
							return filenames.size > (filenames.has(filename) ? 1 : 0);
						}
						return false;
					},
				});
				if (result.modified) {
					for (const [oldKey, newKeys] of result.replacedKeys) {
						for (const newKey of newKeys) {
							const hintFilenames = this.#knownKeys.getKeys(oldKey);
							if (this.#translationData.copyTranslations(filename, oldKey, newKey, hintFilenames)) {
								this.#translationDataModified = true;
							}
						}
					}
					this.#extractKeys(source, prefix);
					this.#modifiedSources.add(filename);
				}
			}
		}
		for (const [filename, file] of this.#translationData.files) {
			if (!this.#sources.has(filename) || file.content.size === 0) {
				this.#translationData.deleteFile(filename);
				this.#translationDataModified = true;
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
	async handleModified(hooks: ProjectHandleModifiedHooks) {
		if (this.development) {
			const writeTasks: (void | Promise<void>)[] = [];

			for (const filename of this.#modifiedSources) {
				this.#modifiedSources.delete(filename);
				if (hooks.writeSource) {
					writeTasks.push(hooks.writeSource(this.#sources.get(filename)!));
				}
			}

			if (this.#translationDataModified) {
				this.#translationDataModified = false;
				if (hooks.writeTranslationData) {
					writeTasks.push(hooks.writeTranslationData(this.#translationData));
				}
			}

			await Promise.all(writeTasks);
		} else {
			for (const filename of this.#modifiedSources) {
				this.diagnostics.report({
					type: Diagnostic.Type.ModifiedSource,
					details: {},
					filename
				});
			}
			if (this.#translationDataModified) {
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
	addExternalLocale(localeId: string, filename: string, data: LocaleData) {
		const entries = this.#externalLocales.get(localeId);
		if (entries) {
			entries.set(filename, data);
		} else {
			this.#externalLocales.set(localeId, new Map([[filename, data]]));
		}
	}

	/**
	 * Compile translation data and external locales.
	 * @returns A map of locale ids to compiled locale data.
	 */
	compileLocales() {
		const locales = this.#translationData.compile(this.config, this.diagnostics);
		for (const [localeId, files] of this.#externalLocales) {
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
	reportDiagnosticsToConsole() {
		this.diagnostics.on("report", diagnostic => {
			const handling = this.config.getDiagnosticHandling(diagnostic.type);
			if (handling === Config.DiagnosticHandling.Error) {
				console.log(this.diagnosticFormatter.format(diagnostic));
				process.exitCode = 1;
			} else if (handling !== Config.DiagnosticHandling.Ignore) {
				console.log(this.diagnosticFormatter.format(diagnostic));
			}
		});
	}

	/**
	 * Run the standard production or development workflow for this project.
	 */
	async run(options?: ProjectRunOptions) {
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
		const externals = options?.externals ?? true;
		if (watch) {
			const externalLocaleFiles = new Map<string, string>();
			for (const locale in this.config.externalLocales) {
				const patterns = this.config.externalLocales[locale];
				const filenames = deduplicateModuleFilenames(await findFiles(this.config.context, patterns));
				for (const filename of filenames) {
					externalLocaleFiles.set(filename, locale);
				}
			}
			watchFiles({
				cwd: this.config.context,
				patterns: [
					translationDataPath,
					...externalLocaleFiles.keys(),
					...sourcePatterns.map(pattern => joinPattern(this.config.src, pattern)),
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
						const locale = externalLocaleFiles.get(filename);
						if (locale !== undefined) {
							if (externals) {
								await updateExternalLocale.call(this, locale, filename);
							}
							continue files;
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
			if (externals) {
				for (const locale in this.config.externalLocales) {
					const patterns = this.config.externalLocales[locale];
					const filenames = deduplicateModuleFilenames(await findFiles(this.config.context, patterns));
					for (const filename of filenames) {
						await updateExternalLocale.call(this, locale, filename);
					}
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

	/**
	 * If false, external locales are not included in the output.
	 *
	 * @default true
	 */
	externals?: boolean;
}
