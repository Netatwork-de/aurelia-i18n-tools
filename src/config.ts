import { resolve } from "node:path";
import { Diagnostic } from "./diagnostics.js";

export interface ConfigOptions {
	/**
	 * The path of the source root directory.
	 * @default "./src"
	 */
	src?: string;

	/**
	 * The filename of the translation data file.
	 * @default "./i18n.json"
	 */
	translationData?: string;

	/**
	 * The filename template for compiled locale data.
	 *
	 * The `[locale]` placeholder is replaced with the locale code.
	 *
	 * @default "./dist/[locale]/translation.json"
	 */
	output?: string;

	/**
	 * A prefix that should be used for all keys in this project.
	 * (excluding translations from external packages)
	 */
	prefix?: string;

	/**
	 * An array of locales. The first one is the locale used in source files.
	 * @default ["en"]
	 */
	locales?: string[];

	/**
	 * A list of ignore rules.
	 * Text content and attribute values that include interpolation are always ignored.
	 */
	ignore?: {
		/** Ignore elements and subtrees by tag name */
		element?: ConfigOptions.IgnoreRule
		/** Ignore text content */
		textContent?: ConfigOptions.IgnoreRule
		/** Ignore attribute values */
		attributeValue?: ConfigOptions.IgnoreRule
	}[];

	/**
	 * A map of elements that can be localized.
	 * By default, nothing is localized.
	 *
	 * `"*"` can be used as property to match all elements.
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

	/**
	 * A map of elements to custom whitespace handling during extraction.
	 *
	 * `"*"` can be used as property to match all elements.
	 */
	whitespace?: Record<string, {
		/**
		 * Whitespace handling for all attributes or a map with attribute names.
		 *
		 * `"*"` can be used as property to match all attributes.
		 */
		attributes?: Record<string, Config.WhitespaceHandling>;
		/**
		 *
		 */
		content?: Config.WhitespaceHandling;
	} | Config.WhitespaceHandling>;

	/**
	 * Configure how diagnostics are handled.
	 */
	diagnostics?: {
		[t in Diagnostic.Type | "all"]?: Config.DiagnosticHandling;
	};

	/**
	 * An object with locales as keys and patterns to include as external locales.
	 *
	 * Default is an empty object.
	 */
	externalLocales?: Record<string, string[]>;
}

export namespace ConfigOptions {
	export type IgnoreRule = string | RegExp | ((value: string) => boolean);
}

export interface Config {
	/** Absolute path of the project root directory */
	readonly context: string;
	/** Absolute path of the source root directory */
	readonly src: string;
	/** Absolute path of the translation data file */
	readonly translationData: string;
	/** A function to get the absolute output filename for compiled locale data. */
	readonly getOutputFilename: (locale: string) => string;
	/** A common prefix used for all keys */
	readonly prefix: string;
	/** An array of locales. The first one is the locale used in source files. */
	readonly locales: string[];
	/** A function that is called to check if an element and it's sub tree should be ignored. */
	ignoreElement: (tagName: string) => boolean;
	/** A function that is called to check text content should be ignored. */
	ignoreTextContent: (content: string) => boolean;
	/** A function that is called to check if an attribute should be ignored. */
	ignoreAttributeValue: (name: string) => boolean;
	/** Get the configuration how an element is localized. */
	getLocalizedElement: (tagName: string) => Config.LocalizedElement | undefined;
	/** Get whitespace handling config for an element. */
	getElementWhitespaceHandling: (tagName: string) => Config.ElementWhitespaceHandling;
	/** A function that is used to determine how a specific diagnostic type is handled. */
	getDiagnosticHandling: (type: Diagnostic.Type) => Config.DiagnosticHandling;
	/** An object with locales as keys and patterns to include as external locales. */
	readonly externalLocales: Record<string, string[]>;
}

export namespace Config {
	export enum DiagnosticHandling { Error = "error", Warning = "warn", Ignore = "ignore" }

	export enum WhitespaceHandling {
		/** Extract whitespace as is. */
		Preserve = "preserve",
		/** Trim leading and trailing whitespace. */
		Trim = "trim",
		/** Collapse leading, trailing and whitespace in between text to a single space. */
		Collapse = "collapse",
		/** Trim leading and trailing whitespace and collapse whitespace in betweeen text to a single space. */
		TrimCollapse = "trim-collapse"
	}

	export interface LocalizedElement {
		readonly content: ElementContentLocalizationType;
		readonly attributes: ReadonlySet<string>;
	}

	export interface ElementWhitespaceHandling {
		getAttribute: (name: string) => WhitespaceHandling;
		content: WhitespaceHandling;
	}
}

const DIAGNOSTIC_HANDLING_TYPES = new Set<Config.DiagnosticHandling>([
	Config.DiagnosticHandling.Error,
	Config.DiagnosticHandling.Warning,
	Config.DiagnosticHandling.Ignore
]);

export enum ElementContentLocalizationType { None = "none", Html = "html", Text = "text" }

const ELEMENT_CONTENT_LOCALIZATION_TYPES = new Set<ElementContentLocalizationType>([
	ElementContentLocalizationType.None,
	ElementContentLocalizationType.Html,
	ElementContentLocalizationType.Text
]);

const WHITESPACE_HANDLING_TYPES = new Set<Config.WhitespaceHandling>([
	Config.WhitespaceHandling.Preserve,
	Config.WhitespaceHandling.Trim,
	Config.WhitespaceHandling.Collapse,
	Config.WhitespaceHandling.TrimCollapse
]);

const WHITESPACE_HANDLING_TYPES_STR = `"preserve", "trim", "collapse" or "trim-collapse"`;

/**
 * Utility for providing auto completion for js config files.
 */
export function defineConfig(options: ConfigOptions): ConfigOptions {
	return options;
}

/**
 * Create a configuration from simplified options.
 * @param context Absolute path of the project root directory.
 * @param options The config json data.
 */
export function createConfig(context: string, options: ConfigOptions = {}): Config {
	type IgnoreCallback = (value: string) => boolean;

	function containsInterpolation(value: string) {
		return /\$\{.*\}/.test(value);
	}

	const ignoreElements: IgnoreCallback[] = [];
	const ignoreTextContent: IgnoreCallback[] = [containsInterpolation];
	const ignoreAttributeValue: IgnoreCallback[] = [containsInterpolation];

	function convertIgnoreRule(rule: ConfigOptions.IgnoreRule) {
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

	let localizedElementFallback: Config.LocalizedElement | undefined = undefined;
	const localizedElements = new Map<string, Config.LocalizedElement>();
	if (options.localize) {
		for (const tagName in options.localize) {
			const item = options.localize[tagName];
			if (item.content && !ELEMENT_CONTENT_LOCALIZATION_TYPES.has(item.content)) {
				throw new TypeError(`localize.${tagName}.content must be "none", "html" or "text".`);
			}
			if (item.attributes && (!Array.isArray(item.attributes) || !item.attributes.every(n => typeof n === "string"))) {
				throw new TypeError(`localize.${tagName}.attributes must be an array of strings.`);
			}

			const config: Config.LocalizedElement = {
				content: item.content || ElementContentLocalizationType.None,
				attributes: new Set(item.attributes || [])
			};

			if (tagName === "*") {
				localizedElementFallback = config;
			} else {
				localizedElements.set(tagName, config);
			}
		}
	}

	let elementWhitespaceHandlingFallback: Config.ElementWhitespaceHandling = {
		getAttribute: () => Config.WhitespaceHandling.Preserve,
		content: Config.WhitespaceHandling.Preserve
	};
	const elementWhitespaceHandling = new Map<string, Config.ElementWhitespaceHandling>();
	if (options.whitespace) {
		for (const tagName in options.whitespace) {
			const item = options.whitespace[tagName];

			let handling: Config.ElementWhitespaceHandling;
			if (typeof item === "object" && item !== null) {
				let attributeFallback: Config.WhitespaceHandling = Config.WhitespaceHandling.Preserve;
				const attributes = new Map<string, Config.WhitespaceHandling>();

				let content: Config.WhitespaceHandling = Config.WhitespaceHandling.Preserve;
				if (item.attributes) {
					for (const attributeName in item.attributes) {
						const value = item.attributes[attributeName];
						if (!WHITESPACE_HANDLING_TYPES.has(value)) {
							throw new TypeError(`whitespace.${tagName}.attributes.${attributeName} must be ${WHITESPACE_HANDLING_TYPES_STR}.`);
						}
						if (attributeName === "*") {
							attributeFallback = value;
						} else {
							attributes.set(attributeName, value);
						}
					}
				}
				if (item.content) {
					if (!WHITESPACE_HANDLING_TYPES.has(item.content)) {
						throw new TypeError(`whitespace.${tagName}.content must be ${WHITESPACE_HANDLING_TYPES_STR}.`);
					}
					content = item.content;
				}

				handling = {
					getAttribute: name => attributes.get(name) || attributeFallback,
					content
				};
			} else {
				if (!WHITESPACE_HANDLING_TYPES.has(item)) {
					throw new TypeError(`whitespace.${tagName} must be ${WHITESPACE_HANDLING_TYPES_STR}.`);
				}
				handling = {
					getAttribute: () => item,
					content: item
				}
			}

			if (tagName === "*") {
				elementWhitespaceHandlingFallback = handling;
			} else {
				elementWhitespaceHandling.set(tagName, handling);
			}
		}
	}

	if (options.prefix !== undefined && typeof options.prefix !== "string") {
		throw new TypeError(`prefix must be a string.`);
	}

	const locales = options.locales ?? ["en"];
	if (!Array.isArray(locales) || !locales.every(l => typeof l === "string") || locales.length === 0) {
		throw new TypeError(`locales must be an array of at least one string.`);
	}

	const diagnosticHandlingFallback = options.diagnostics?.all || Config.DiagnosticHandling.Warning;
	if (!DIAGNOSTIC_HANDLING_TYPES.has(diagnosticHandlingFallback)) {
		throw new TypeError(`diagnostics.all must be "error", "warn" or "ignore".`);
	}

	const diagnosticHandling = new Map<Diagnostic.Type, Config.DiagnosticHandling>();
	for (const key in options.diagnostics || {}) {
		if (key !== "all") {
			if (!Diagnostic.TYPES.has(key as Diagnostic.Type)) {
				throw new TypeError(`invalid diagnostic type: ${key}`);
			}
			const type = options.diagnostics![key as Diagnostic.Type]!;
			if (!DIAGNOSTIC_HANDLING_TYPES.has(type)) {
				throw new TypeError(`diagnostics["${key}"] must be "error", "warn" or "ignore".`);
			}
			diagnosticHandling.set(key as Diagnostic.Type, type);
		}
	}

	return {
		context,
		src: resolve(context, options.src || "./src"),
		translationData: resolve(context, options.translationData || "./i18n.json"),
		getOutputFilename: locale => resolve(context, (options.output ?? "./dist/[locale]/translation.json").replace(/\[locale\]/g, locale)),
		externalLocales: options.externalLocales ?? {},
		prefix: options.prefix || "",
		locales,
		ignoreElement: createIgnoreFunction(ignoreElements),
		ignoreTextContent: createIgnoreFunction(ignoreTextContent),
		ignoreAttributeValue: createIgnoreFunction(ignoreAttributeValue),
		getLocalizedElement: tagName => localizedElements.get(tagName) || localizedElementFallback,
		getElementWhitespaceHandling: tagName => elementWhitespaceHandling.get(tagName) || elementWhitespaceHandlingFallback,
		getDiagnosticHandling: type => diagnosticHandling.get(type) || diagnosticHandlingFallback
	};
}
