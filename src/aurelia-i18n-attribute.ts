
const NAMES_KEY_PAIR = /\s*(?:\[([a-z0-9\s_,.-]+)\])?\s*([a-z0-9_.-]+)\s*(?:;\s*)?/ig;
const NAME_DELIMITER = /,/g;

/**
 * Representation of the "t" i18n attribute from aurelia-i18n.
 */
export class AureliaI18nAttribute implements Iterable<[string, string]> {
	#nameToKey = new Map<string, string>();

	get isEmpty() {
		return this.#nameToKey.size === 0;
	}

	[Symbol.iterator]() {
		return this.#nameToKey[Symbol.iterator]();
	}

	has(name: string) {
		return this.#nameToKey.has(name);
	}

	set(name: string, key: string) {
		this.#nameToKey.set(name, key);
		if (name === "text") {
			this.#nameToKey.delete("html");
		} else if (name === "html") {
			this.#nameToKey.delete("text");
		}
	}

	get(name: string) {
		return this.#nameToKey.get(name);
	}

	keys() {
		return this.#nameToKey.values();
	}

	mapKeysToNames() {
		const keyToNames = new Map<string, string[]>();
		for (const [name, key] of this.#nameToKey) {
			const names = keyToNames.get(key);
			if (names) {
				names.push(name);
			} else {
				keyToNames.set(key, [name]);
			}
		}
		return keyToNames;
	}

	toString() {
		return Array.from(this.mapKeysToNames())
			.map(([key, names]) => (names.length === 1 && names[0] === "text") ? key : `[${names.join(",")}]${key}`)
			.join(";");
	}

	static parse(value: string) {
		const attribute = new AureliaI18nAttribute();
		NAMES_KEY_PAIR.lastIndex = 0;
		while (NAMES_KEY_PAIR.lastIndex < value.length) {
			const namesKeyPair = NAMES_KEY_PAIR.exec(value);
			if (!namesKeyPair) {
				throw new TypeError();
			}
			for (const rawName of (namesKeyPair[1] || "text").split(NAME_DELIMITER)) {
				const name = rawName.trim();
				if (name.length > 0) {
					if (attribute.has(name)) {
						throw new TypeError();
					}
					attribute.set(name, namesKeyPair[2]);
				}
			}
		}
		return attribute;
	}
}
