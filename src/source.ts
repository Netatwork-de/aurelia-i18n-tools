import { Config } from "./config";

export interface Source {
	/**
	 * Extract all i18n keys.
	 * @param config The project configuration.
	 * @param options The extract options.
	 * @returns A map of i18n keys to english translations
	 */
	extractKeys(config: Config, options: SourceExtractKeysOptions): Map<string, string>;
}

export interface SourceExtractKeysOptions {
	/**
	 * A prefix that is used if keys in the source file are relative.
	 */
	readonly prefix: string;
}
