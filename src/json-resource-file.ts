import { Source, SourceExtractKeysOptions } from "./source";
import { Config } from "./config";

export class JsonResourceFile implements Source {
	public constructor(private readonly _data: JsonResourceData) {}

	public static parse(source: string) {
		return new JsonResourceFile(JSON.parse(source));
	}

	public extractKeys(config: Config, options: SourceExtractKeysOptions) {
		const keys = new Map<string, string>();
		(function traverse(data: JsonResourceData, path: string[]) {
			if (data === null || typeof data !== "object" || Array.isArray(data)) {
				// TODO: Raise diagnostic for invalid data.
			} else {
				for (let part in data) {
					if (part.includes(".")) {
						// TODO: Raise diagnostic for dangerous part name.
					}
					const childPath = path.concat(part);
					const child = data[part];
					if (typeof child === "string") {
						keys.set(`${options.prefix}${childPath.join(".")}`, child);
					} else {
						traverse(child, childPath);
					}
				}
			}
		})(this._data, []);
		return keys;
	}
}

interface JsonResourceData {
	[part: string]: JsonResourceData | string;
}
