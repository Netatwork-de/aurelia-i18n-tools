import { isAbsolute, join, relative } from "node:path";
import { Config } from "./config.js";
import { Diagnostic, Diagnostics } from "./diagnostics.js";
import { LocaleData } from "./locale-data.js";

/**
 * A container for translation data that is used as an
 * interface between this library and external tools.
 */
export class TranslationData {
	public constructor(
		/** A map of absolute filenames to file information */
		public readonly files = new Map<string, TranslationData.File>(),

		/** An array of obsolete translations */
		public readonly obsolete: TranslationData.ObsoleteTranslation[] = [],

		/** The version of the file that was loaded */
		public readonly parsedVersion: 1 | 2 = 2
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
			if (keys.size > 0) {
				this.files.set(filename, file);
			}
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
		for (const [key, translationSet] of file.content) {
			if (!keys.has(key)) {
				this.pushObsoleteSet(translationSet);
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
		const locales = new Map<string, LocaleData>(config.locales.map(locale => {
			return [locale, LocaleData.createNew()];
		}));
		for (const [filename, file] of this.files) {
			for (const [key, translationSet] of file.content) {
				function setKey(localeId: string, content: string) {
					const locale = locales.get(localeId);
					if (!locale) {
						diagnostics.report({
							type: Diagnostic.Type.UnknownLocale,
							details: { key, localeId },
							filename,
						});
					} else if (!LocaleData.set(locales.get(localeId)!, key, content)) {
						diagnostics.report({
							type: Diagnostic.Type.DuplicateKey,
							details: { key },
							filename
						});
					}
				}
				setKey(config.locales[0], translationSet.source.content);
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
		for (const [filename, file] of this.files) {
			for (const [key, translationSet] of file.content) {
				for (const localeId of config.locales) {
					if (localeId !== config.locales[0] && !translationSet.translations.has(localeId)) {
						diagnostics.report({
							type: Diagnostic.Type.MissingTranslation,
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
	 * Replace a key and keep all the translations.
	 * @param filename The filename.
	 * @param oldKey The key to replace.
	 * @param newKey The new key.
	 * @param hintFilenames A hint to other files where translations for the old key could be found.
	 * @returns true if anything has been copied.
	 */
	public copyTranslations(filename: string, oldKey: string, newKey: string, hintFilenames?: Iterable<string>) {
		const file = this.files.get(filename);
		if (file) {
			const translation = file.content.get(oldKey);
			if (translation && translation.translations.size > 0) {
				file.content.set(newKey, TranslationData.cloneTranslationSet(translation));
				return true;
			} else if (hintFilenames) {
				for (const filename of hintFilenames) {
					const oldFile = this.files.get(filename);
					if (oldFile) {
						const translation = oldFile.content.get(oldKey);
						if (translation && translation.translations.size > 0) {
							file.content.set(newKey, TranslationData.cloneTranslationSet(translation));
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	private pushObsoleteSet(translationSet: TranslationData.TranslationSet) {
		if (translationSet.translations.size > 0) {
			this.obsolete.push({
				content: translationSet.source.content,
				translations: new Map(Array.from(translationSet.translations).map(([localeId, translation]) => {
					return [localeId, translation.content];
				}))
			});
		}
	}

	public deleteFile(filename: string) {
		var file = this.files.get(filename);
		if (file) {
			this.files.delete(filename);
			for (var translationSet of file.content.values()) {
				this.pushObsoleteSet(translationSet);
			}
		}
	}

	/**
	 * Deep clone a translation set.
	 * @param value The set to clone.
	 * @param markAsOutdated If true, the clone will be marked as outdated. Default is `true`
	 */
	public static cloneTranslationSet(value: TranslationData.TranslationSet, markAsOutdated = true): TranslationData.TranslationSet {
		const translations = new Map();
		for (const [localeId, translation] of value.translations) {
			translations.set(localeId, TranslationData.cloneTranslation(translation));
		}
		const clone = { source: TranslationData.cloneTranslation(value.source), translations };
		if (markAsOutdated) {
			clone.source.lastModified = Date.now();
		}
		return clone;
	}

	/**
	 * Deep clone a translation object.
	 */
	public static cloneTranslation(value: TranslationData.Translation): TranslationData.Translation {
		return {
			content: value.content,
			lastModified: value.lastModified,
			ignoreSpelling: Array.from(value.ignoreSpelling)
		};
	}

	/**
	 * Validate and add json data.
	 * @param json The json data.
	 * @param basePath The base path for resolving filenames.
	 */
	public static parse(json: string, basePath: string) {
		const data: TranslationData.JsonV1 | TranslationData.JsonV2 = JSON.parse(json);
		if (!isObject(data)) {
			throw new TypeError(`data must be an object.`);
		}
		const files = new Map<string, TranslationData.File>();
		const obsolete: TranslationData.ObsoleteTranslation[] = [];

		let version: 1 | 2;
		let jsonFiles: Record<string, TranslationData.JsonV2.File>;
		let jsonObsolete: TranslationData.JsonV2.ObsoleteTranslation[];
		if (TranslationData.isJsonV2(data)) {
			jsonFiles = data.files;
			if (!isObject(jsonFiles)) {
				throw new TypeError(`files must be an object.`);
			}

			jsonObsolete = data.obsolete;
			if (!Array.isArray(jsonObsolete)) {
				throw new TypeError(`obsolete must be an array.`);
			}

			version = 2;
		} else {
			jsonFiles = data;
			jsonObsolete = [];
			version = 1;
		}

		for (let name in jsonFiles) {
			if (isAbsolute(name)) {
				throw new TypeError(`data contains a non relative filename: ${name}`);
			}
			const jsonFile = jsonFiles[name];
			if (!isObject(jsonFile)) {
				throw new TypeError(`files["${name}"] must be an object.`);
			}
			if (!isObject(jsonFile.content)) {
				throw new TypeError(`files["${name}"].content must be an object.`);
			}
			const content = new Map<string, TranslationData.TranslationSet>();
			for (const key in jsonFile.content) {
				function parseTranslation(data: TranslationData.JsonV2.Translation, location: string): TranslationData.Translation {
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
				const keyData = jsonFile.content[key];
				const source = parseTranslation(keyData, `files["${name}"].content["${key}"]`);
				const translations = new Map<string, TranslationData.Translation>();
				if (!isObject(keyData.translations)) {
					throw new TypeError(`files["${name}"].content["${key}"].translations must be an object.`);
				}
				for (const locale in keyData.translations) {
					translations.set(locale, parseTranslation(keyData.translations[locale], `files["${name}"].content["${key}"].translations["${locale}"]`));
				}
				content.set(key, { source, translations });
			}
			files.set(filenameFromJson(basePath, name), { content });
		}

		for (let i = 0; i < jsonObsolete.length; i++) {
			var jsonItem = jsonObsolete[i];
			if (!isObject(jsonItem)) {
				throw new TypeError(`obsolete[${i}] must be an object.`);
			}
			if (typeof jsonItem.content !== "string") {
				throw new TypeError(`obsolete[${i}].content must be a string.`);
			}
			if (!isObject(jsonItem.translations)) {
				throw new TypeError(`obsolete[${i}].translations must be an object.`);
			}
			const translations = new Map<string, string>();
			for (const locale in jsonItem.translations) {
				if (typeof jsonItem.translations[locale] !== "string") {
					throw new TypeError(`obsolete[${i}].translations["${locale}"] must be a string.`);
				}
				translations.set(locale, jsonItem.translations[locale]);
			}
			obsolete.push({
				content: jsonItem.content,
				translations
			});
		}

		return new TranslationData(files, obsolete, version);
	}

	/**
	 * Format this translation data as json.
	 * @param basePath The base path for creating relative filenames.
	 */
	public formatJson(basePath: string) {
		const json: TranslationData.JsonV2 = Object.create(null)
		json.version = 2;

		const sortedFiles = Array.from(this.files)
			.map<[string, TranslationData.File]>(([filename, file]) => [filenameToJson(basePath, filename), file])
			.sort(sortByKey);

		const jsonFiles: Record<string, TranslationData.JsonV2.File> = Object.create(null);
		json.files = jsonFiles;

		for (const [name, file] of sortedFiles) {
			const fileJson: TranslationData.JsonV2.File = Object.create(null);
			fileJson.content = Object.create(null);

			for (const [key, translationSet] of Array.from(file.content).sort(sortByKey)) {
				const translationSetJson: TranslationData.JsonV2.TranslationSet = Object.create(null);
				function formatTranslation(to: TranslationData.JsonV2.Translation, from: TranslationData.Translation) {
					to.content = from.content;
					to.lastModified = new Date(from.lastModified).toISOString();
					to.ignoreSpelling = from.ignoreSpelling;
				}
				formatTranslation(translationSetJson, translationSet.source);
				translationSetJson.translations = Object.create(null);

				for (const [locale, translation] of Array.from(translationSet.translations).sort(sortByKey)) {
					const translationJson: TranslationData.JsonV2.Translation = Object.create(null);
					formatTranslation(translationJson, translation);
					translationSetJson.translations[locale]  = translationJson;
				}
				fileJson.content[key] = translationSetJson;
			}
			jsonFiles[name] = fileJson;
		}

		const jsonObsolete: TranslationData.JsonV2.ObsoleteTranslation[] = [];
		json.obsolete = jsonObsolete;

		const rawObsoleteItems = new Set<string>();
		for (const item of this.obsolete) {
			const itemJson: TranslationData.JsonV2.ObsoleteTranslation = Object.create(null);
			itemJson.content = item.content;
			itemJson.translations = Object.create(null);
			for (const [locale, content] of Array.from(item.translations).sort(sortByKey)) {
				itemJson.translations[locale] = content;
			}

			const rawJson = JSON.stringify(itemJson);
			if (!rawObsoleteItems.has(rawJson)) {
				rawObsoleteItems.add(rawJson);
				json.obsolete.push(itemJson);
			}
		}

		return JSON.stringify(json, null, "\t");
	}
}

function isObject(value: any) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sortByKey<K, V>([a]: [K, V], [b]: [K, V]) {
	return a < b ? -1 : (a > b ? 1 : 0);
}

function filenameToJson(basePath: string, filename: string) {
	return relative(basePath, filename).replace(/\\/g, "/");
}

function filenameFromJson(basePath: string, name: string) {
	return join(basePath, name);
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

	export interface ObsoleteTranslation {
		/** The content. */
		content: string;
		/** A map of locale ids to translated content. */
		readonly translations: Map<string, string>;
	}

	export function isJsonV2(data: JsonV1 | JsonV2): data is JsonV2 {
		return data.version === 2;
	}

	/**
	 * Type for the json schema of serialized translation data.
	 */
	export interface JsonV2 {
		version: 2;
		files: Record<string, JsonV2.File>;
		obsolete: JsonV2.ObsoleteTranslation[];
	}

	export type JsonV1 = Record<string, JsonV2.File>;

	export namespace JsonV2 {
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

		export interface ObsoleteTranslation {
			content: string;
			translations: Record<string, string>;
		}
	}
}
