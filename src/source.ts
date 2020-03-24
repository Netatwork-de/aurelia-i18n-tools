import { Config } from "./config";
import { Diagnostics } from "./diagnostics";

export interface Source {
	/**
	 * Extract all i18n keys.
	 * @param config The project configuration.
	 * @param options The extract options.
	 * @returns A map of i18n keys to english translations
	 */
	extractKeys(config: Config, options: SourceExtractKeysOptions, diagnostics: Diagnostics): Map<string, string>;
}

export interface SourceExtractKeysOptions {
	/**
	 * A prefix that is used if keys in the source file are relative.
	 */
	readonly prefix: string;
}
