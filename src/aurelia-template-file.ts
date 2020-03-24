import { parseFragment, DefaultTreeDocumentFragment, DefaultTreeElement } from "parse5";
import { traverseElements, getAttributeValue, analyzeElementContent, treeDiagnostics } from "./utility/parse5-tree";
import { Config, ConfigLocalizedElement, ElementContentLocalizationType } from "./config";
import { AureliaI18nAttribute } from "./aurelia-i18n-attribute";
import { Source, SourceExtractKeysOptions } from "./source";
import { Diagnostics, Diagnostic } from "./diagnostics";

/**
 * Represents a localized aurelia template file.
 */
export class AureliaTemplateFile implements Source {
	private constructor(
		private readonly _filename: string,
		private readonly _source: string,
		private readonly _root: DefaultTreeDocumentFragment
	) {}

	public static parse(filename: string, source: string) {
		return new AureliaTemplateFile(filename, source, parseFragment(source, {
			scriptingEnabled: false,
			sourceCodeLocationInfo: true
		}) as DefaultTreeDocumentFragment);
	}

	public extractKeys(config: Config, options: SourceExtractKeysOptions, diagnostics: Diagnostics) {
		const keys = new Map<string, string>();
		for (const element of traverseElements(this._root, config.ignoreElement)) {
			const attributeValue = getAttributeValue(element, "t");
			if (attributeValue) {
				try {
					const attribute = AureliaI18nAttribute.parse(attributeValue);
					for (const [name, key] of attribute) {
						function add(this: AureliaTemplateFile, key: string, value: string) {
							if (keys.has(key)) {
								diagnostics.report({
									type: Diagnostic.Type.ExtractDuplicateKey,
									details: { key },
									filename: this._filename,
									...treeDiagnostics.attribute(element, "t")
								});
							}
							keys.set(key, value);
						}
						if (name === "text" || name === "html") {
							const { text, hasElements } = analyzeElementContent(element, config.ignoreTextContent);
							if (hasElements) {
								diagnostics.report({
									type: Diagnostic.Type.ExtractInvalidLocalizedContent,
									details: { key },
									filename: this._filename,
									...treeDiagnostics.content(element)
								});
							}
							add.call(this, key, text);
						} else {
							const value = getAttributeValue(element, name);
							if (value === undefined) {
								diagnostics.report({
									type: Diagnostic.Type.ExtractMissingAttribute,
									details: { key, name },
									filename: this._filename,
									...treeDiagnostics.startTag(element)
								});
							} else if (config.ignoreAttributeValue(value)) {
								diagnostics.report({
									type: Diagnostic.Type.ExtractInvalidAttributeValue,
									details: { key, name },
									filename: this._filename,
									...treeDiagnostics.attribute(element, name)
								})
							} else {
								add.call(this, key, value);
							}
						}
					}
				} catch (error) {
					diagnostics.report({
						type: Diagnostic.Type.ExtractInvalidTAttribute,
						details: { error },
						filename: this._filename,
						...treeDiagnostics.attribute(element, "t")
					});
				}
			}
		}
		return keys;
	}

	/**
	 * Justify localization keys in this template
	 * file and return the updated source code.
	 * @param config
	 * @param prefix
	 */
	public justifyKeys(config: Config, options: JustifyOptions, diagnostics: Diagnostics) {
		const knownKeys = new Set<string>();
		const candidates: JustificationCandidate[] = [];

		for (const element of traverseElements(this._root, config.ignoreElement)) {
			const elementConfig = config.localizedElements.get(element.tagName);
			const { hasText, hasElements } = analyzeElementContent(element, config.ignoreTextContent);
			const originalAttributeValue = getAttributeValue(element, "t");
			if (elementConfig) {
				if (hasText && hasElements) {
					diagnostics.report({
						type: Diagnostic.Type.JustifyMixedContent,
						details: {},
						filename: this._filename,
						...treeDiagnostics.content(element)
					});
				}

				let originalAttribute: AureliaI18nAttribute | undefined;
				if (originalAttributeValue) {
					try {
						originalAttribute = AureliaI18nAttribute.parse(originalAttributeValue);
						for (const key of originalAttribute.keys()) {
							knownKeys.add(key);
						}
					} catch (error) {
						diagnostics.report({
							type: Diagnostic.Type.JustifyInvalidTAttribute,
							details: { error },
							filename: this._filename,
							...treeDiagnostics.attribute(element, "t")
						});
					}
				}

				candidates.push({ element, elementConfig, hasText, originalAttribute });
			} else {
				if (hasText) {
					diagnostics.report({
						type: Diagnostic.Type.JustifyUnlocalizedText,
						details: {},
						...treeDiagnostics.content(element)
					});
				}
				if (originalAttributeValue) {
					diagnostics.report({
						type: Diagnostic.Type.JustifyDisallowedTAttribute,
						details: {},
						...treeDiagnostics.startTag(element)
					});
				}
			}
		}

		let nextPostfix = 0;
		const generatedKeys = new Set<string>();
		function getUniqueKey(key?: string) {
			if (!key || generatedKeys.has(key)) {
				do {
					key = `${options.prefix}${nextPostfix++}`;
				} while (knownKeys.has(key) || options.isReserved && options.isReserved(key));
			}
			knownKeys.add(key);
			generatedKeys.add(key);
			return key;
		}

		const commits: JustificationCommit[] = [];
		for (const { element, elementConfig, originalAttribute, hasText } of candidates) {
			const attribute = new AureliaI18nAttribute();

			const htmlKey = originalAttribute && originalAttribute.get("html");
			const textKey = originalAttribute && originalAttribute.get("text");
			if (elementConfig.content !== ElementContentLocalizationType.None) {
				if (hasText || htmlKey || textKey) {
					attribute.set(elementConfig.content, getUniqueKey(htmlKey || textKey));
				}
			} else {
				if (htmlKey) {
					attribute.set("html", htmlKey);
				} else if (textKey) {
					attribute.set("text", textKey);
				}
				if (hasText || htmlKey || textKey) {
					diagnostics.report({
						type: Diagnostic.Type.JustifyDisallowedContent,
						details: {},
						filename: this._filename,
						...treeDiagnostics.content
					});
				}
			}

			for (const attributeName of elementConfig.attributes) {
				const value = getAttributeValue(element, attributeName);
				if (value && !config.ignoreAttributeValue(value)) {
					attribute.set(attributeName, getUniqueKey(originalAttribute && originalAttribute.get(attributeName)));
				}
				// TODO: Allow keeping ids if attribute is not set.
			}

			if (originalAttribute) {
				for (const [name, key] of originalAttribute) {
					if (name !== "text" && name !== "html" && !elementConfig.attributes.has(name)) {
						diagnostics.report({
							type: Diagnostic.Type.JustifyDisallowedLocalizedAttribute,
							details: { key, name },
							filename: this._filename,
							...treeDiagnostics.startTag(element)
						});
					}
				}
			}

			for (const key of knownKeys) {
				if (!key.startsWith(options.prefix)) {
					diagnostics.report({
						type: Diagnostic.Type.JustifyWrongPrefix,
						details: { key, expectedPrefix: options.prefix },
						filename: this._filename,
						...treeDiagnostics.attribute(element, "t")
					});
				}
			}

			const location = element.sourceCodeLocation!;
			let start = 0, end = 0;
			if (originalAttribute) {
				const attributeLocation = element.sourceCodeLocation!.attrs.t;
				start = attributeLocation.startOffset;
				end = attributeLocation.endOffset;
				while (/\s/.test(this._source.charAt(start - 1))) {
					start--;
				}
			} else {
				const tagLocation = location.startTag;
				start = end = tagLocation.endOffset - 1;
			}

			if (attribute.isEmpty) {
				commits.push({ start, end, replacement: "" });
			} else {
				commits.push({ start, end, replacement: ` t="${attribute}"` })
			}
		}

		commits.sort((a, b) => a.start - b.start);

		let output = "";
		let sourcePos = 0;
		for (const commit of commits) {
			output += this._source.slice(sourcePos, commit.start);
			output += commit.replacement;
			sourcePos = commit.end;
		}
		output += this._source.slice(sourcePos);
		return output;
	}
}

export interface JustifyOptions {
	/**
	 * The prefix to use to new keys.
	 */
	readonly prefix: string;
	/**
	 * An optional callback to check if the specified i18n key is reserved
	 * by another file that uses the same prefix for some reason.
	 */
	readonly isReserved?: (key: string) => boolean;
}

interface JustificationCandidate {
	readonly element: DefaultTreeElement;
	readonly elementConfig: ConfigLocalizedElement;
	readonly originalAttribute?: AureliaI18nAttribute;
	readonly hasText: boolean;
}

interface JustificationCommit {
	readonly start: number;
	readonly end: number;
	readonly replacement: string;
}
