
/**
 * A set of key value pairs that supports
 * fast queries for both keys and values.
 */
export class PairSet<K, V> {
	private readonly _keys = new Map<K, Set<V>>();
	private readonly _values = new Map<V, Set<K>>();

	public add(key: K, value: V) {
		add(this._keys, key, value);
		add(this._values, value, key);
	}

	public delete(key: K, value: V) {
		del(this._keys, key, value);
		del(this._values, value, key);
	}

	public deleteKey(key: K) {
		const values = this._keys.get(key);
		if (values) {
			this._keys.delete(key);
			for (const value of values) {
				del(this._values, value, key);
			}
		}
	}

	public getKeys(value: V): ReadonlySet<K> | undefined {
		return this._values.get(value);
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
