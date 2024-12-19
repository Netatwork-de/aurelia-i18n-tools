
/**
 * A set of key value pairs that supports
 * fast queries for both keys and values.
 */
export class PairSet<K, V> {
	#keys = new Map<K, Set<V>>();
	#vals = new Map<V, Set<K>>();

	add(key: K, value: V) {
		add(this.#keys, key, value);
		add(this.#vals, value, key);
	}

	delete(key: K, value: V) {
		del(this.#keys, key, value);
		del(this.#vals, value, key);
	}

	deleteKey(key: K) {
		const values = this.#keys.get(key);
		if (values) {
			this.#keys.delete(key);
			for (const value of values) {
				del(this.#vals, value, key);
			}
		}
	}

	getKeys(value: V): ReadonlySet<K> | undefined {
		return this.#vals.get(value);
	}
}

function add<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
	const values = map.get(key);
	if (values) {
		values.add(value);
	} else {
		map.set(key, new Set([value]));
	}
}

function del<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
	const values = map.get(key);
	if (values && values.delete(value) && values.size === 0) {
		map.delete(key);
	}
}
