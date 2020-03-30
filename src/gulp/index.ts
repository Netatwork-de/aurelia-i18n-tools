import * as path from "path";
import { promises as fs } from "fs";
import * as Vinyl from "vinyl";
import { Project } from "../project";
import { Config } from "../config";
import { Source } from "../source";
import { AureliaTemplateFile } from "../aurelia-template-file";
import { JsonResourceFile } from "../json-resource-file";
import { TranslationData } from "../translation-data";
import { LocaleData } from "../locale-data";

export function createGulpI18n(): GulpI18n {
	const Vinyl = require("vinyl") as typeof import("vinyl");

	let project: Project | undefined = undefined;
	let externalLocalesAdded = false;

	return async (options: GulpI18nOptions) => {
		if (project) {
			if (project.config !== options.config || project.development !== options.development) {
				throw new TypeError("options.config and options.development must be the same in every task run.");
			}
		} else {
			project = new Project({
				config: options.config,
				development: options.development
			});

			project.diagnostics.on("report", diagnostic => {
				console.log(project?.diagnosticFormatter.format(diagnostic));
			});
		}

		const translationDataPath = path.resolve(options.config.context, options.translationDataPath || "i18n.json");
		try {
			const translationData = await fs.readFile(translationDataPath, "utf8");
			project.translationData = TranslationData.parse(translationData, path.dirname(translationDataPath));
		} catch (error) {
			if (error.code !== "ENOENT") {
				throw error;
			}
		}

		function updateSources(from: NodeJS.ReadableStream, factory: (filename: string, source: string) => Source) {
			return new Promise<void>((resolve, reject) => {
				from.on("error", reject);
				from.on("end", resolve);
				from.on("data", (file: Vinyl) => {
					if (file.isBuffer()) {
						const sourceCode = file.contents.toString("utf8");
						const source = factory(file.path, sourceCode);
						project!.updateSource(source);
					} else if (!file.isDirectory()) {
						reject(new Error(`Source files must be represented as buffers.`));
					}
				});
			});
		}

		const tasks = [
			options.aureliaTemplateFiles && updateSources(options.aureliaTemplateFiles, AureliaTemplateFile.parse),
			options.jsonResourceFiles && updateSources(options.jsonResourceFiles, JsonResourceFile.parse)
		];

		if (!externalLocalesAdded && options.externalLocales) {
			externalLocalesAdded = true;
			const externalLocales = options.externalLocales();
			for (const localeId in externalLocales) {
				const from = externalLocales[localeId];
				tasks.push(new Promise<void>((resolve, reject) => {
					from.on("error", reject);
					from.on("end", resolve);
					from.on("data", (file: Vinyl) => {
						if (file.isBuffer()) {
							const data = JSON.parse(file.contents.toString("utf8"));
							if (LocaleData.validate(data)) {
								project!.addExternalLocale(localeId, data);
							} else {
								reject(new Error(`External locale file contains invalid data: ${file.path}`));
							}
						} else if (!file.isDirectory()) {
							reject(new Error(`External locale files must be represented as buffers.`));
						}
					});
				}));
			}
		}

		await Promise.all<void>(tasks);

		project.processSources({
			enforcePrefix: options.enforcePrefix
		});

		const writeSources = options.writeSources && options.writeSources();
		await project.handleModified({
			writeSource: writeSources && (source => {
				writeSources.write(new Vinyl({
					path: source.filename,
					base: options.config.src,
					contents: Buffer.from(source.source)
				}));
			}),
			async writeTranslationData(data) {
				await fs.writeFile(translationDataPath, data.formatJson(path.dirname(translationDataPath)));
			}
		});
		writeSources?.end();

		if (options.writeLocales) {
			const filenameTemplate = options.localeFilename || "[id].json";
			const writeLocales = options.writeLocales();
			const locales = project.compileLocales();
			for (const [id, data] of locales) {
				const filename = filenameTemplate.replace(/\[id\]/g, id);
				writeLocales.write(new Vinyl({
					path: filename,
					contents: Buffer.from(JSON.stringify(data))
				}));
			}
		}
	};
}

export type GulpI18n = (options: GulpI18nOptions) => Promise<void>;

export interface GulpI18nOptions {
	config: Config;
	development: boolean;

	enforcePrefix?: boolean;

	translationDataPath?: string;
	aureliaTemplateFiles?: NodeJS.ReadableStream;
	jsonResourceFiles?: NodeJS.ReadableStream;
	localeFilename?: string;
	externalLocales?: () => Record<string, NodeJS.ReadableStream>;
	writeSources?: () => NodeJS.WritableStream;
	writeLocales?: () => NodeJS.WritableStream;
}
