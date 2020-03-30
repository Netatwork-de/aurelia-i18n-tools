import { EventEmitter } from "events";
import * as colors from "ansi-colors";
import * as path from "path";
import { inspect } from "util";

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
		ModifiedTranslation = "modified-translation"
	}

	export type Details<T extends Type> = {
		[Type.InvalidJsonData]: { path: string[] };
		[Type.InvalidJsonPartName]: { path: string[] };
		[Type.MixedContent]: {};
		[Type.InvalidTAttribute]: { error: any };
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
		Type.ModifiedTranslation
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
	public report<T extends Diagnostic.Type>(diagnostic: Diagnostic<T>) {
		this.emit("report", diagnostic);
	}
}

export class DiagnosticFormatter {
	public constructor(options: DiagnosticFormatterOptions = {}) {
		this.color = options.color === undefined ? true : options.color;
		this.context = options.context;
	}

	public color: boolean;
	public context?: string;

	private formatPropertyPath(path: string[]) {
		return colors.green(path.join("/"));
	}

	private formatError(error: any) {
		return inspect(error, false, undefined, this.color);
	}

	private formatName(name: string) {
		return `"${colors.green(name)}"`;
	}

	private readonly messages: {
		[T in Diagnostic.Type]: (details: Diagnostic.Details<T>) => string
	} = {
		[Diagnostic.Type.InvalidJsonData]: d => `Invalid json data at ${this.formatPropertyPath(d.path)}. Only objects and strings are allowed.`,
		[Diagnostic.Type.InvalidJsonPartName]: d => `Invalid json property name at ${this.formatPropertyPath(d.path)}. Property names should not contain dots.`,
		[Diagnostic.Type.MixedContent]: d => `Element contains both text content and elements.`,
		[Diagnostic.Type.InvalidTAttribute]: d => `Malformed t-attribute value: ${this.formatError(d.error)}`,
		[Diagnostic.Type.UnlocalizedText]: d => `Element contains unlocalized text content.`,
		[Diagnostic.Type.DisallowedTAttribute]: d => `Unconfigured element has a t-attribute.`,
		[Diagnostic.Type.DisallowedContent]: d => `Unconfigured element contains text or html content.`,
		[Diagnostic.Type.DisallowedLocalizedAttribute]: d => `Unconfigured attribute ${this.formatName(d.name)} is localized with key ${this.formatName(d.key)}.`,
		[Diagnostic.Type.WrongPrefix]: d => `Key ${this.formatName(d.key)} is expected to start with the prefix ${this.formatName(d.expectedPrefix)}.`,
		[Diagnostic.Type.DuplicateKeyOrPath]: d => `Duplicate localization key or path: ${this.formatPropertyPath(d.path)}`,
		[Diagnostic.Type.DuplicateKey]: d => `Duplicate localization key: ${this.formatName(d.key)}`,
		[Diagnostic.Type.OutdatedTranslation]: d => `Translation of ${this.formatName(d.key)} for locale ${this.formatName(d.localeId)} is outdated.`,
		[Diagnostic.Type.MissingTranslation]: d => `Translation of ${this.formatName(d.key)} for locale ${this.formatName(d.localeId)} is missing.`,
		[Diagnostic.Type.ModifiedSource]: d => `Changes to the source should have been committed.`,
		[Diagnostic.Type.ModifiedTranslation]: d => `Changes to translation data should have been committed.`
	};

	public format<T extends Diagnostic.Type>(diagnostic: Diagnostic<T>) {
		let fileInfo = "";
		if (diagnostic.filename) {
			const filename = (this.context ? path.relative(this.context, diagnostic.filename) : diagnostic.filename);
			fileInfo = ` ${colors.cyan.underline(filename)}`;
			if (diagnostic.start) {
				fileInfo += `:${colors.yellowBright(String(diagnostic.start.line))}:${colors.yellowBright(String(diagnostic.start.col))}`;
			}
		}

		const message = this.messages[diagnostic.type](<Diagnostic.Details<any>> diagnostic.details);

		return `[${colors.red("aurelia-i18n")}]${fileInfo} ${message}`;
	}
}

export interface DiagnosticFormatterOptions {
	prefix?: string;
	color?: boolean;
	context?: string;
}
