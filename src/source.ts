import { Config } from "./config.js";
import { Diagnostics } from "./diagnostics.js";

export interface Source {
	/**
	 * The absolute filename.
	 */
	readonly filename: string;

	/**
	 * The source code.
	 */
	readonly source: string;

	/**
	 * Extract localization keys.
	 * @param config The project configuration.
	 * @returns A map of i18n keys to english translations
	 */
	extractKeys(config: Config, options: SourceExtractKeysOptions): Map<string, string>;

	/**
	 * Justify localization keys.
	 * @param config The project configuration.
	 */
	justifyKeys?(config: Config, options: SourceJustifyKeysOptions): SourceJustifyKeysResult;
}

export interface SourceExtractKeysOptions {
	/**
	 * A prefix that is used if keys in the source file are relative.
	 */
	readonly prefix: string;
	/**
	 * The diagnostics host.
	 */
	readonly diagnostics: Diagnostics;
}

export interface SourceJustifyKeysOptions {
	/**
	 * The prefix to use to new keys.
	 */
	readonly prefix: string;
	/**
	 * The diagnostics host.
	 */
	readonly diagnostics: Diagnostics;
	/**
	 * If true, only diagnostics are reported and the source is not modified.
	 */
	readonly diagnosticsOnly?: boolean;
	/**
	 * An optional callback to check if the specified i18n key is reserved
	 * by another file that uses the same prefix for some reason.
	 */
	readonly isReserved?: (key: string) => boolean;
}

export interface SourceJustifyKeysResult {
	/** true if the source has been modified. */
	readonly modified: boolean;
	/** A map of old keys to new keys that were replaced. */
	readonly replacedKeys: Map<string, Set<string>>;
}
