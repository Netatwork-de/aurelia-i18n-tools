import { Config } from "./config.js";
import { Source, SourceExtractKeysOptions } from "./source.js";
import { LocaleData } from "./locale-data.js";
import { Diagnostic } from "./diagnostics.js";

export class JsonResourceFile implements Source {
	public constructor(
		private readonly _filename: string,
		private readonly _source: string,
		private readonly _data: LocaleData
	) {}

	public get filename() {
		return this._filename;
	}

	public get source() {
		return this._source;
	}

	public static parse(filename: string, source: string) {
		return new JsonResourceFile(filename, source, JSON.parse(source));
	}

	public extractKeys(config: Config, { prefix, diagnostics }: SourceExtractKeysOptions) {
		const keys = new Map<string, string>();
		(function traverse(this: JsonResourceFile, data: LocaleData, path: string[]) {
			if (data === null || typeof data !== "object" || Array.isArray(data)) {
				diagnostics.report({
					type: Diagnostic.Type.InvalidJsonData,
					details: { path },
					filename: this._filename,
					source: this.source
				});
			} else {
				for (let part in data) {
					if (part.includes(".")) {
						diagnostics.report({
							type: Diagnostic.Type.InvalidJsonPartName,
							details: { path },
							filename: this._filename
						});
					}
					const childPath = path.concat(part);
					const child = data[part];
					if (typeof child === "string") {
						keys.set(`${prefix}${childPath.join(".")}`, child);
					} else {
						traverse.call(this, child, childPath);
					}
				}
			}
		}).call(this, this._data, []);
		return keys;
	}
}
