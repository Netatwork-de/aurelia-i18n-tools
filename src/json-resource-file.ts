import { Source, SourceExtractKeysOptions } from "./source";
import { Config } from "./config";
import { LocaleData } from "./locale-data";
import { Diagnostics, Diagnostic } from "./diagnostics";

export class JsonResourceFile implements Source {
	public constructor(
		private readonly _filename: string,
		private readonly _data: LocaleData
	) {}

	public static parse(filename: string, source: string) {
		return new JsonResourceFile(filename, JSON.parse(source));
	}

	public extractKeys(config: Config, options: SourceExtractKeysOptions, diagnostics: Diagnostics) {
		const keys = new Map<string, string>();
		(function traverse(this: JsonResourceFile, data: LocaleData, path: string[]) {
			if (data === null || typeof data !== "object" || Array.isArray(data)) {
				diagnostics.report({
					type: Diagnostic.Type.ExtractInvalidJsonData,
					details: { path },
					filename: this._filename
				});
			} else {
				for (let part in data) {
					if (part.includes(".")) {
						diagnostics.report({
							type: Diagnostic.Type.ExtractInvalidJsonPartName,
							details: { path },
							filename: this._filename
						});
					}
					const childPath = path.concat(part);
					const child = data[part];
					if (typeof child === "string") {
						keys.set(`${options.prefix}${childPath.join(".")}`, child);
					} else {
						traverse.call(this, child, childPath);
					}
				}
			}
		}).call(this, this._data, []);
		return keys;
	}
}
