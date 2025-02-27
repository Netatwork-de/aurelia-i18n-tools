import colors from "ansi-colors";
import { EventEmitter } from "node:events";
import { relative } from "node:path";
import { inspect } from "node:util";

export interface Diagnostic<T extends Diagnostic.Type> extends DiagnosticLocationPair {
	readonly type: T;
	readonly details: Diagnostic.Details<T>;
	readonly filename?: string;
	readonly source?: string;
}

export namespace Diagnostic {
	export enum Type {
		InvalidJsonData = "invalid-json-data",
		InvalidJsonPartName = "invalid-json-part-name",
		MixedContent = "mixed-content",
		InvalidTAttribute = "invalid-t-attribute",
		UnlocalizedText = "unlocalized-text",
		DisallowedTAttribute = "disallowed-t-attribute",
		DisallowedContent = "disallowed-content",
		DisallowedLocalizedAttribute = "disallowed-localized-attribute",
		WrongPrefix = "wrong-prefix",
		DuplicateKeyOrPath = "duplicate-key-or-path",
		DuplicateKey = "duplicate-key",
		OutdatedTranslation = "outdated-translation",
		MissingTranslation = "missing-translation",
		ModifiedSource = "modified-source",
		ModifiedTranslation = "modified-translation",
		UnknownLocale = "unknown-locale",
	}

	export type Details<T extends Type> = {
		[Type.InvalidJsonData]: { path: string[] };
		[Type.InvalidJsonPartName]: { path: string[] };
		[Type.MixedContent]: {};
		[Type.InvalidTAttribute]: { error: unknown };
		[Type.UnlocalizedText]: {};
		[Type.DisallowedTAttribute]: {};
		[Type.DisallowedContent]: {};
		[Type.DisallowedLocalizedAttribute]: { key: string, name: string };
		[Type.WrongPrefix]: { key: string, expectedPrefix: string };
		[Type.DuplicateKeyOrPath]: { path: string[] };
		[Type.DuplicateKey]: { key: string };
		[Type.OutdatedTranslation]: { key: string, localeId: string };
		[Type.MissingTranslation]: { key: string, localeId: string };
		[Type.ModifiedSource]: {};
		[Type.ModifiedTranslation]: {};
		[Type.UnknownLocale]: { key: string, localeId: string };
	}[T];

	export const TYPES = new Set<Type>([
		Type.InvalidJsonData,
		Type.InvalidJsonPartName,
		Type.MixedContent,
		Type.InvalidTAttribute,
		Type.UnlocalizedText,
		Type.DisallowedTAttribute,
		Type.DisallowedContent,
		Type.DisallowedLocalizedAttribute,
		Type.WrongPrefix,
		Type.DuplicateKeyOrPath,
		Type.DuplicateKey,
		Type.OutdatedTranslation,
		Type.MissingTranslation,
		Type.ModifiedSource,
		Type.ModifiedTranslation,
		Type.UnknownLocale,
	]);
}

export interface DiagnosticLocation {
	readonly offset: number;
	readonly line: number;
	readonly col: number;
}

export interface DiagnosticLocationPair {
	readonly start?: DiagnosticLocation;
	readonly end?: DiagnosticLocation;
}

export declare interface Diagnostics {
	on(event: "report", listener: (diagnostic: Diagnostic<any>) => void): this;
	on(event: string | symbol, listener: (...args: any[]) => void): this;
}

export class Diagnostics extends EventEmitter {
	report<T extends Diagnostic.Type>(diagnostic: Diagnostic<T>) {
		this.emit("report", diagnostic);
	}
}

export class DiagnosticFormatter {
	constructor(options: DiagnosticFormatterOptions = {}) {
		this.color = options.color ?? true;
		this.context = options.context;
	}

	/**
	 * See {@link DiagnosticFormatterOptions.color}
	 */
	color: boolean;

	/**
	 * See {@link DiagnosticFormatterOptions.context}
	 */
	context?: string;

	#formatPropertyPath(path: string[]) {
		return colors.green(path.join("/"));
	}

	#formatError(error: unknown) {
		return inspect(error, false, undefined, this.color);
	}

	#formatName(name: string) {
		return `"${colors.green(name)}"`;
	}

	#messages: {
		[T in Diagnostic.Type]: (details: Diagnostic.Details<T>) => string
	} = {
		[Diagnostic.Type.InvalidJsonData]: d => `Invalid json data at ${this.#formatPropertyPath(d.path)}. Only objects and strings are allowed.`,
		[Diagnostic.Type.InvalidJsonPartName]: d => `Invalid json property name at ${this.#formatPropertyPath(d.path)}. Property names should not contain dots.`,
		[Diagnostic.Type.MixedContent]: d => `Element contains both text content and elements.`,
		[Diagnostic.Type.InvalidTAttribute]: d => `Malformed t-attribute value: ${this.#formatError(d.error)}`,
		[Diagnostic.Type.UnlocalizedText]: d => `Element contains unlocalized text content.`,
		[Diagnostic.Type.DisallowedTAttribute]: d => `Unconfigured element has a t-attribute.`,
		[Diagnostic.Type.DisallowedContent]: d => `Unconfigured element contains text or html content.`,
		[Diagnostic.Type.DisallowedLocalizedAttribute]: d => `Unconfigured attribute ${this.#formatName(d.name)} is localized with key ${this.#formatName(d.key)}.`,
		[Diagnostic.Type.WrongPrefix]: d => `Key ${this.#formatName(d.key)} is expected to start with the prefix ${this.#formatName(d.expectedPrefix)}.`,
		[Diagnostic.Type.DuplicateKeyOrPath]: d => `Duplicate localization key or path: ${this.#formatPropertyPath(d.path)}`,
		[Diagnostic.Type.DuplicateKey]: d => `Duplicate localization key: ${this.#formatName(d.key)}`,
		[Diagnostic.Type.OutdatedTranslation]: d => `Translation of ${this.#formatName(d.key)} for locale ${this.#formatName(d.localeId)} is outdated.`,
		[Diagnostic.Type.MissingTranslation]: d => `Translation of ${this.#formatName(d.key)} for locale ${this.#formatName(d.localeId)} is missing.`,
		[Diagnostic.Type.ModifiedSource]: d => `Source file is not in sync with translation data. Run i18n tools in development mode once and check for i18n related changes.`,
		[Diagnostic.Type.ModifiedTranslation]: d => `Translation data is not in sync with source files. Run i18n tools in development mode once and check for i18n related changes.`,
		[Diagnostic.Type.UnknownLocale]: d => `Key ${this.#formatName(d.key)} has translations for ${this.#formatName(d.localeId)}, but this locale is not configured.`,
	};

	format<T extends Diagnostic.Type>(diagnostic: Diagnostic<T>) {
		let fileInfo = "";
		if (diagnostic.filename) {
			const filename = (this.context ? relative(this.context, diagnostic.filename) : diagnostic.filename);
			fileInfo = ` ${colors.cyan.underline(filename)}`;
			if (diagnostic.start) {
				fileInfo += `:${colors.yellowBright(String(diagnostic.start.line))}:${colors.yellowBright(String(diagnostic.start.col))}`;
			}
		}
		const message = this.#messages[diagnostic.type](<Diagnostic.Details<any>> diagnostic.details);
		let raw = `[${colors.red("aurelia-i18n")}]${fileInfo} ${message}`;
		if (!this.color) {
			raw = colors.strip(raw);
		}
		return raw;
	}
}

export interface DiagnosticFormatterOptions {
	/**
	 * If true (default), formatted output is colored.
	 */
	color?: boolean;

	/**
	 * Optional absolute path to omit from formatted file paths.
	 */
	context?: string;
}
