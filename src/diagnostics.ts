import { EventEmitter } from "events";

export interface Diagnostic<T extends Diagnostic.Type> extends DiagnosticLocationPair {
	readonly type: T;
	readonly details: Diagnostic.Details<T>;
	readonly filename?: string;
}

export namespace Diagnostic {
	export enum Type {
		ExtractInvalidJsonData,
		ExtractInvalidJsonPartName,
		ExtractDuplicateKey,
		ExtractInvalidLocalizedContent,
		ExtractMissingAttribute,
		ExtractInvalidAttributeValue,
		ExtractInvalidTAttribute,
		JustifyMixedContent,
		JustifyInvalidTAttribute,
		JustifyUnlocalizedText,
		JustifyDisallowedTAttribute,
		JustifyDisallowedContent,
		JustifyDisallowedLocalizedAttribute,
		JustifyWrongPrefix,
		MergeDuplicateKeyOrPath,
		CompileDuplicateKey
	}

	export type Details<T extends Type> = {
		[Type.ExtractInvalidJsonData]: { path: string[] };
		[Type.ExtractInvalidJsonPartName]: { path: string[] };
		[Type.ExtractDuplicateKey]: { key: string };
		[Type.ExtractInvalidLocalizedContent]: { key: string };
		[Type.ExtractMissingAttribute]: { key: string, name: string };
		[Type.ExtractInvalidAttributeValue]: { key: string, name: string };
		[Type.ExtractInvalidTAttribute]: { error: any };
		[Type.JustifyMixedContent]: {};
		[Type.JustifyInvalidTAttribute]: { error: any };
		[Type.JustifyUnlocalizedText]: {};
		[Type.JustifyDisallowedTAttribute]: {};
		[Type.JustifyDisallowedContent]: {};
		[Type.JustifyDisallowedLocalizedAttribute]: { key: string, name: string };
		[Type.JustifyWrongPrefix]: { key: string, expectedPrefix: string };
		[Type.MergeDuplicateKeyOrPath]: { path: string[] };
		[Type.CompileDuplicateKey]: { key: string };
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
