import { Config } from "./config";

export interface Source {
	/**
	 * Called to extract i18n keys.
	 * @param config The project configuration.
	 * @returns A map of i18n keys to english translations
	 */
	extractKeys(config: Config): Map<string, string>;
}
