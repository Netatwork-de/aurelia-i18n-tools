import * as path from "path";
import { LocaleData } from "./locale-data";
import { Config } from "./config";
import { Diagnostics, Diagnostic } from "./diagnostics";

/**
 * A container for translation data that is used as an
 * interface between this library and external tools.
 */
export class TranslationData {
	public constructor(
		/** A map of absolute filenames to file information */
		public readonly files = new Map<string, TranslationData.File>()
	) {}

	/**
	 * Update extracted keys and delete missing ones.
	 * @param filename The filename.
	 * @param keys A map of i18n keys to english translations.
	 * @returns true if anything has been modified.
	 */
	public updateKeys(filename: string, keys: Map<string, string>) {
		let modified = false;
		let file = this.files.get(filename);
		if (!file) {
			file = { content: new Map() };
			this.files.set(filename, file);
		}
		for (const [key, content] of keys) {
			const translation = file.content.get(key);
			if (translation) {
				if (translation.source.content !== content) {
					translation.source.content = content;
					translation.source.lastModified = Date.now();
					modified = true;
				}
			} else {
				file.content.set(key, {
					source: {
						content,
						lastModified: Date.now(),
						ignoreSpelling: []
					},
					translations: new Map()
				});
				modified = true;
			}
		}
		for (const key of file.content.keys()) {
			if (!keys.has(key)) {
				file.content.delete(key);
				modified = true;
			}
		}
		return modified;
	}

	/**
	 * Compile all included locales.
	 * @param config The project configuration.
	 * @returns A map of locale ids to compiled locale data.
	 */
	public compile(config: Config, diagnostics: Diagnostics) {
		const locales = new Map<string, LocaleData>();
		for (const [filename, file] of this.files) {
			for (const [key, translationSet] of file.content) {
				function setKey(localeId: string, content: string) {
					let locale = locales.get(localeId);
					if (!locale) {
						locale = LocaleData.createNew();
						locales.set(localeId, locale);
					}
					if (!LocaleData.set(locale, key, content)) {
						diagnostics.report({
							type: Diagnostic.Type.DuplicateKey,
							details: { key },
							filename
						});
					}
				}
				setKey(config.sourceLocaleId, translationSet.source.content);
				for (const [localeId, translation] of translationSet.translations) {
					if (translation.lastModified >= translationSet.source.lastModified) {
						setKey(localeId, translation.content);
					} else {
						diagnostics.report({
							type: Diagnostic.Type.OutdatedTranslation,
							details: { key, localeId },
							filename
						});
					}
				}
			}
		}
		return locales;
	}

	/**
	 * Validate and add json data.
	 * @param json The json data.
	 * @param basePath The base path for resolving filenames.
	 */
	public static parse(json: string, basePath: string) {
		const data: TranslationData.Json = JSON.parse(json);
		if (!isObject(data)) {
			throw new TypeError(`data must be an object.`);
		}
		const files = new Map<string, TranslationData.File>();
		for (let name in data) {
			if (path.isAbsolute(name)) {
				throw new TypeError(`data contains a non relative filename: ${name}`);
			}
			const fileData = data[name];
			if (!isObject(fileData)) {
				throw new TypeError(`data["${name}"] must be an object.`);
			}
			if (!isObject(fileData.content)) {
				throw new TypeError(`data["${name}"].content must be an object.`);
			}
			const content = new Map<string, TranslationData.TranslationSet>();
			for (let key in fileData.content) {
				function parseTranslation(data: TranslationData.Json.Translation, location: string): TranslationData.Translation {
					if (!isObject(data)) {
						throw new TypeError(`${location} must be an object.`);
					}
					if (typeof data.content !== "string") {
						throw new TypeError(`${location}.content must be a string.`);
					}
					const lastModified = Date.parse(data.lastModified);
					if (isNaN(lastModified)) {
						throw new TypeError(`${location}.lastModified must be a full iso date string.`);
					}
					if (!Array.isArray(data.ignoreSpelling) || data.ignoreSpelling.some(v => typeof v !== "string")) {
						throw new TypeError(`${location}.ignoreSpelling must be an array of strings.`);
					}
					return {
						content: data.content,
						lastModified,
						ignoreSpelling: data.ignoreSpelling
					};
				}
				const keyData = fileData.content[key];
				const source = parseTranslation(keyData, `data["${name}"].content["${key}"]`);
				const translations = new Map<string, TranslationData.Translation>();
				if (!isObject(keyData.translations)) {
					throw new TypeError(`data["${name}"].content["${key}"].translations must be an object.`);
				}
				for (const locale in keyData.translations) {
					translations.set(locale, parseTranslation(keyData.translations[locale], `data["${name}"].content["${key}"].translations["${locale}"]`));
				}
				content.set(key, { source, translations });
			}
			files.set(path.join(basePath, name), { content });
		}
		return new TranslationData(files);
	}

	/**
	 * Format this translation data as json.
	 * @param basePath The base path for creating relative filenames.
	 */
	public formatJson(basePath: string) {
		// TODO: Ensure dynamic key sorting.
		const json: TranslationData.Json = Object.create(null);
		for (const [filename, file] of this.files) {
			const fileJson: TranslationData.Json.File = Object.create(null);
			fileJson.content = Object.create(null);
			for (const [key, translationSet] of file.content) {
				const translationSetJson: TranslationData.Json.TranslationSet = Object.create(null);
				function formatTranslation(to: TranslationData.Json.Translation, from: TranslationData.Translation) {
					to.content = from.content;
					to.lastModified = new Date(from.lastModified).toISOString();
					to.ignoreSpelling = from.ignoreSpelling;
				}
				formatTranslation(translationSetJson, translationSet.source);
				translationSetJson.translations = Object.create(null);
				for (const [locale, translation] of translationSet.translations) {
					const translationJson: TranslationData.Json.Translation = Object.create(null);
					formatTranslation(translationJson, translation);
					translationSetJson.translations[locale]  = translationJson;
				}
				fileJson.content[key] = translationSetJson;
			}
			json[path.relative(basePath, filename).replace(/\\/g, "/")] = fileJson;
		}
		return JSON.stringify(json, null, "\t");
	}
}

function isObject(value: any) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export namespace TranslationData {
	/** Represents a source file. */
	export interface File {
		/** The key translation pairs that are extracted from the file. */
		readonly content: Map<string, TranslationSet>;
	}

	/** Represents an extracted translation with additional translations. */
	export interface TranslationSet {
		/** The translation from the source file. */
		source: Translation;
		/** A map of locale ids to additional translations. */
		readonly translations: Map<string, Translation>;
	}

	/** Represents a translation value. */
	export interface Translation {
		/** The content. */
		content: string;
		/** The last time this value was modified. */
		lastModified: number;
		/** An array of strings that are ignored by spell checkers. */
		ignoreSpelling: string[];
	}

	/**
	 * Type for the json schema of serialized translation data.
	 */
	export type Json = Record<string, Json.File>;
	export namespace Json {
		export interface File {
			content: Record<string, TranslationSet>;
		}

		export interface TranslationSet extends Translation {
			translations: Record<string, Translation>;
		}

		export interface Translation {
			content: string;
			lastModified: string;
			ignoreSpelling: string[];
		}
	}
}
