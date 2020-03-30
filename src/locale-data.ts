import { Diagnostics, Diagnostic } from "./diagnostics";

export interface LocaleData {
	[part: string]: LocaleData | string;
}

export namespace LocaleData {
	/**
	 * Create an empty locale data object.
	 */
	export function createNew(): LocaleData {
		return Object.create(null);
	}

	/**
	 * Try setting a distinct key.
	 * @returns false if the key already exists.
	 */
	export function set(data: LocaleData, key: string, content: string) {
		const parts = key.split(".");
		for (let i = 0; i < parts.length - 1; i++) {
			const child = data[parts[i]];
			if (typeof child === "string") {
				return false;
			} else if (child === undefined) {
				data = data[parts[i]] = createNew();
			} else {
				data = child;
			}
		}
		const target = data[parts[parts.length - 1]];
		if (target === undefined) {
			data[parts[parts.length - 1]] = content;
		} else {
			return false;
		}
		return true;
	}

	/**
	 * Check if the specified object represents valid locale data.
	 * @param data Data to validate.
	 */
	export function validate(data: LocaleData) {
		if (data === null || typeof data !== "object" || Array.isArray(data)) {
			return false;
		}
		for (const part in data) {
			const child = data[part];
			if (typeof child !== "string" && !validate(child)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Merge a source locale data into the target locale data.
	 */
	export function merge(target: LocaleData, source: LocaleData, diagnostics: Diagnostics) {
		(function merge(to: LocaleData, from: LocaleData, path: string[]) {
			for (const part in from) {
				const child = from[part];
				if (typeof child === "string") {
					if (part in to) {
						diagnostics.report({
							type: Diagnostic.Type.DuplicateKeyOrPath,
							details: { path: path.concat(part) }
						});
					} else {
						to[part] = child;
					}
				} else {
					if (part in to) {
						const target = to[part];
						if (typeof target === "string") {
							diagnostics.report({
								type: Diagnostic.Type.DuplicateKeyOrPath,
								details: { path: path.concat(part) }
							});
						} else {
							merge(target, child, path.concat(part));
						}
					} else {
						merge(to[part] = createNew(), child, path.concat(part));
					}
				}
			}
		})(target, source, []);
	}

	/**
	 * Clone locale data.
	 */
	export function clone(data: LocaleData) {
		return JSON.parse(JSON.stringify(data));
	}

	/**
	 * Combine locale data objects.
	 * @param sources The objects to combine.
	 * @returns The new locale data object.
	 */
	export function combine(sources: LocaleData[], diagnostics: Diagnostics) {
		const target = createNew();
		sources.forEach(source => merge(target, source, diagnostics));
		return target;
	}
}
