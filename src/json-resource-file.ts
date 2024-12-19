import { Config } from "./config.js";
import { Diagnostic } from "./diagnostics.js";
import { LocaleData } from "./locale-data.js";
import { Source, SourceExtractKeysOptions } from "./source.js";

export class JsonResourceFile implements Source {
	#filename: string;
	#source: string;
	#data: LocaleData;

	constructor(filename: string, source: string, data: LocaleData) {
		this.#filename = filename;
		this.#source = source;
		this.#data = data;
	}

	get filename() {
		return this.#filename;
	}

	get source() {
		return this.#source;
	}

	static parse(filename: string, source: string) {
		return new JsonResourceFile(filename, source, JSON.parse(source));
	}

	extractKeys(config: Config, { prefix, diagnostics }: SourceExtractKeysOptions) {
		const keys = new Map<string, string>();
		(function traverse(this: JsonResourceFile, data: LocaleData, path: string[]) {
			if (data === null || typeof data !== "object" || Array.isArray(data)) {
				diagnostics.report({
					type: Diagnostic.Type.InvalidJsonData,
					details: { path },
					filename: this.#filename,
					source: this.source
				});
			} else {
				for (let part in data) {
					if (part.includes(".")) {
						diagnostics.report({
							type: Diagnostic.Type.InvalidJsonPartName,
							details: { path },
							filename: this.#filename
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
		}).call(this, this.#data, []);
		return keys;
	}
}
