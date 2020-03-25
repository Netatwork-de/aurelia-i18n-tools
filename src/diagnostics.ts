import { EventEmitter } from "events";

export interface Diagnostic<T extends Diagnostic.Type> extends DiagnosticLocationPair {
	readonly type: T;
	readonly details: Diagnostic.Details<T>;
	readonly filename?: string;
}

export namespace Diagnostic {
	export enum Type {
		InvalidJsonData = "extract-invalid-json-data",
		InvalidJsonPartName = "extract-invalid-json-part-name",
		MixedContent = "justify-mixed-content",
		InvalidTAttribute = "justify-invalid-t-attribute",
		UnlocalizedText = "justify-unlocalized-text",
		DisallowedTAttribute = "justify-disallowed-t-attribute",
		DisallowedContent = "justify-disallowed-content",
		DisallowedLocalizedAttribute = "justify-disallowed-localized-attribute",
		WrongPrefix = "justify-wrong-prefix",
		DuplicateKeyOrPath = "merge-duplicate-key-or-path",
		DuplicateKey = "compile-duplicate-key",
		OutdatedTranslation = "outdated-translation"
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
	}[T];
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
