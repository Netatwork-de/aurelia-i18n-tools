import * as path from "path";

export interface ConfigOptions {
	/**
	 * The path of the source root directory.
	 * @default "./src"
	 */
	src?: string;

	/**
	 * A prefix that should be used for all keys in this project.
	 * (excluding translations from external packages)
	 */
	prefix?: string;

	/**
	 * An id for the locale that is used in source files.
	 * @default "en"
	 */
	sourceLocale?: string;

	/**
	 * A list of ignore rules.
	 * Text content and attribute values that include interpolation are always ignored.
	 */
	ignore?: {
		/** Ignore elements and subtrees by tag name */
		element?: ConfigOptionsIgnoreRule
		/** Ignore text content */
		textContent?: ConfigOptionsIgnoreRule
		/** Ignore attribute values */
		attributeValue?: ConfigOptionsIgnoreRule
	}[];

	/**
	 * A map of elements that can be localized.
	 * By default, nothing is localized.
	 */
	localize?: Record<string, {
		/**
		 * Specify how text content is localized.
		 * By default text content is not allowed.
		 */
		content?: ElementContentLocalizationType;
		/**
		 * An array of attribute names that can be localized.
		 * By default no attributes are localized.
		 */
		attributes?: string[];
	}>;
}

export type ConfigOptionsIgnoreRule = string | RegExp | ((value: string) => boolean);

export interface Config {
	/** Absolute path of the project root directory */
	readonly context: string;
	/** Absolute path of the source root directory */
	readonly src: string;
	/** A common prefix used for all keys */
	readonly prefix: string;
	/** An id for the locale that is used in source files. */
	readonly sourceLocaleId: string;
	/** A function that is called to check if an element and it's sub tree should be ignored. */
	ignoreElement: (tagName: string) => boolean;
	/** A function that is called to check text content should be ignored. */
	ignoreTextContent: (content: string) => boolean;
	/** A function that is called to check if an attribute should be ignored. */
	ignoreAttributeValue: (name: string) => boolean;
	/** A map of localized tags. */
	localizedElements: ReadonlyMap<string, ConfigLocalizedElement>;
}

export interface ConfigLocalizedElement {
	readonly content: ElementContentLocalizationType;
	readonly attributes: ReadonlySet<string>;
}

export enum ElementContentLocalizationType { None = "none", Html = "html", Text = "text" }

const ELEMENT_CONTENT_LOCALIZATION_TYPES = new Set<ElementContentLocalizationType>([
	ElementContentLocalizationType.None,
	ElementContentLocalizationType.Html,
	ElementContentLocalizationType.Text
]);

/**
 * Create a configuration from simplified options.
 * @param context Absolute path of the project root directory.
 * @param options The config json data.
 */
export function createConfig(context: string, options: ConfigOptions): Config {
	type IgnoreCallback = (value: string) => boolean;

	function containsInterpolation(value: string) {
		return /\$\{.*\}/.test(value);
	}

	const ignoreElements: IgnoreCallback[] = [];
	const ignoreTextContent: IgnoreCallback[] = [containsInterpolation];
	const ignoreAttributeValue: IgnoreCallback[] = [containsInterpolation];

	function convertIgnoreRule(rule: ConfigOptionsIgnoreRule) {
		if (typeof rule === "string") {
			const regexp = new RegExp(rule);
			return (value: string) => regexp.test(value);
		} else if (typeof rule === "function") {
			return rule;
		} else if (rule instanceof RegExp) {
			return (value: string) => rule.test(value);
		} else {
			throw new TypeError(`Invalid ignore rule: ${rule}`);
		}
	}

	function createIgnoreFunction(callbacks: IgnoreCallback[]) {
		return (value: string) => callbacks.some(callback => callback(value));
	}

	if (options.ignore) {
		for (const rule of options.ignore) {
			if (rule.element) {
				ignoreElements.push(convertIgnoreRule(rule.element));
			}
			if (rule.attributeValue) {
				ignoreAttributeValue.push(convertIgnoreRule(rule.attributeValue));
			}
			if (rule.textContent) {
				ignoreTextContent.push(convertIgnoreRule(rule.textContent));
			}
		}
	}

	const localizedElements = new Map<string, ConfigLocalizedElement>();
	if (options.localize) {
		for (const tagName in options.localize) {
			const item = options.localize[tagName];
			if (item.content && !ELEMENT_CONTENT_LOCALIZATION_TYPES.has(item.content)) {
				throw new TypeError(`localize.${tagName}.content must be "none", "html" or "text".`);
			}
			if (item.attributes && (!Array.isArray(item.attributes) || !item.attributes.every(n => typeof n === "string"))) {
				throw new TypeError(`localize.${tagName}.attributes must be an array of strings.`);
			}
			localizedElements.set(tagName, {
				content: item.content || ElementContentLocalizationType.None,
				attributes: new Set(item.attributes || [])
			})
		}
	}

	if (options.prefix !== undefined && typeof options.prefix !== "string") {
		throw new TypeError(`prefix must be a string.`);
	}
	if (options.sourceLocale !== undefined && typeof options.sourceLocale !== "string") {
		throw new TypeError(`sourceLocale must be a string.`);
	}

	return {
		context,
		src: path.resolve(context, options.src || "./src"),
		prefix: options.prefix || "",
		sourceLocaleId: options.sourceLocale || "en",
		ignoreElement: createIgnoreFunction(ignoreElements),
		ignoreTextContent: createIgnoreFunction(ignoreTextContent),
		ignoreAttributeValue: createIgnoreFunction(ignoreAttributeValue),
		localizedElements
	}
}
