
const NAMES_KEY_PAIR = /\s*(?:\[([a-z0-9\s_,.-]+)\])?\s*([a-z0-9_.-]+)\s*(?:;\s*)?/ig;
const NAME_DELIMITER = /,/g;

/**
 * Representation of the "t" i18n attribute from aurelia-i18n.
 */
export class AureliaI18nAttribute implements Iterable<[string, string]> {
	private readonly _nameToKey = new Map<string, string>();

	public get isEmpty() {
		return this._nameToKey.size === 0;
	}

	public [Symbol.iterator]() {
		return this._nameToKey[Symbol.iterator]();
	}

	public has(name: string) {
		return this._nameToKey.has(name);
	}

	public set(name: string, key: string) {
		this._nameToKey.set(name, key);
		if (name === "text") {
			this._nameToKey.delete("html");
		} else if (name === "html") {
			this._nameToKey.delete("text");
		}
	}

	public get(name: string) {
		return this._nameToKey.get(name);
	}

	public keys() {
		return this._nameToKey.values();
	}

	public mapKeysToNames() {
		const keyToNames = new Map<string, string[]>();
		for (const [name, key] of this._nameToKey) {
			const names = keyToNames.get(key);
			if (names) {
				names.push(name);
			} else {
				keyToNames.set(key, [name]);
			}
		}
		return keyToNames;
	}

	public toString() {
		return Array.from(this.mapKeysToNames())
			.map(([key, names]) => (names.length === 1 && names[0] === "text") ? key : `[${names.join(",")}]${key}`)
			.join(";");
	}

	public static parse(value: string) {
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
