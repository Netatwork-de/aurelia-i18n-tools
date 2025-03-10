import { parseFragment } from "parse5";
import { AureliaI18nAttribute } from "./aurelia-i18n-attribute.js";
import { Config, ElementContentLocalizationType } from "./config.js";
import { Diagnostic } from "./diagnostics.js";
import { Source, SourceExtractKeysOptions, SourceJustifyKeysOptions, SourceJustifyKeysResult } from "./source.js";
import { analyzeElementContent, DocumentFragment, Element, getAttributeValue, traverseElements, treeDiagnostics } from "./utility/parse5-tree.js";

/**
 * Represents a localized aurelia template file.
 */
export class AureliaTemplateFile implements Source {
	#filename: string;
	#source: string;
	#root: DocumentFragment;

	constructor(filename: string, source: string, root: DocumentFragment) {
		this.#filename = filename;
		this.#source = source;
		this.#root = root;
	}

	static #parseHtml(source: string) {
		return parseFragment(source, {
			scriptingEnabled: false,
			sourceCodeLocationInfo: true
		});
	}

	static parse(filename: string, source: string) {
		return new AureliaTemplateFile(filename, source, AureliaTemplateFile.#parseHtml(source));
	}

	get filename() {
		return this.#filename;
	}

	get source() {
		return this.#source;
	}

	extractKeys(config: Config, { diagnostics }: SourceExtractKeysOptions) {
		const keys = new Map<string, string>();
		for (const element of traverseElements(this.#root, config.ignoreElement)) {
			const elementWhitespaceHandling = config.getElementWhitespaceHandling(element.tagName);

			const attributeValue = getAttributeValue(element, "t");
			if (attributeValue !== undefined && !config.ignoreAttributeValue(attributeValue)) {
				try {
					const attribute = AureliaI18nAttribute.parse(attributeValue);
					for (const [name, key] of attribute) {
						function add(this: AureliaTemplateFile, key: string, value: string, whitespaceHandling: Config.WhitespaceHandling) {
							switch (whitespaceHandling) {
								case Config.WhitespaceHandling.Trim:
									value = value.replace(/^\s*|\s*$/g, "");
									break;

								case Config.WhitespaceHandling.Collapse:
									value = value.replace(/\s+/g, " ");
									break;

								case Config.WhitespaceHandling.TrimCollapse:
									value = value.replace(/^\s*|\s*$/g, "").replace(/\s+/g, " ");
									break;
							}
							keys.set(key, value);
						}
						if (name === "text" || name === "html") {
							const { text } = analyzeElementContent(element, config.ignoreTextContent);
							add.call(this, key, text, elementWhitespaceHandling.content);
						} else {
							const value = getAttributeValue(element, name);
							if (value !== undefined && !config.ignoreAttributeValue(value)) {
								add.call(this, key, value, elementWhitespaceHandling.getAttribute(name));
							}
						}
					}
				} catch (error) {
					diagnostics.report({
						type: Diagnostic.Type.InvalidTAttribute,
						details: { error },
						filename: this.filename,
						source: this.source,
						...treeDiagnostics.attribute(element, "t"),
					});
				}
			}
		}
		return keys;
	}

	justifyKeys(config: Config, { prefix, diagnostics, diagnosticsOnly, isReserved }: SourceJustifyKeysOptions): SourceJustifyKeysResult {
		const knownKeys = new Set<string>();
		const candidates: JustificationCandidate[] = [];

		for (const element of traverseElements(this.#root, config.ignoreElement)) {
			const elementConfig = config.getLocalizedElement(element.tagName);
			const { hasText, hasElements } = analyzeElementContent(element, config.ignoreTextContent);
			const originalAttributeValue = getAttributeValue(element, "t");
			if (elementConfig) {
				if (hasText && hasElements) {
					diagnostics.report({
						type: Diagnostic.Type.MixedContent,
						details: {},
						filename: this.filename,
						source: this.source,
						...treeDiagnostics.content(element)
					});
				}

				let originalAttribute: AureliaI18nAttribute | undefined;
				if (originalAttributeValue !== undefined && !config.ignoreAttributeValue(originalAttributeValue)) {
					try {
						originalAttribute = AureliaI18nAttribute.parse(originalAttributeValue);
						for (const key of originalAttribute.keys()) {
							knownKeys.add(key);
						}
					} catch (error) {
						diagnostics.report({
							type: Diagnostic.Type.InvalidTAttribute,
							details: { error },
							filename: this.filename,
							source: this.source,
							...treeDiagnostics.attribute(element, "t")
						});
					}
				}

				candidates.push({ element, elementConfig, hasText, originalAttribute });
			} else {
				if (hasText) {
					diagnostics.report({
						type: Diagnostic.Type.UnlocalizedText,
						details: {},
						filename: this.filename,
						source: this.source,
						...treeDiagnostics.content(element)
					});
				}
				if (originalAttributeValue !== undefined) {
					diagnostics.report({
						type: Diagnostic.Type.DisallowedTAttribute,
						details: {},
						filename: this.filename,
						source: this.source,
						...treeDiagnostics.startTag(element)
					});
				}
			}
		}

		let nextPostfix = 0;
		const generatedKeys = new Set<string>();
		const replacedKeys = new Map<string, Set<string>>();
		function getUniqueKey(preferredKey?: string) {
			let key = preferredKey;
			function mustBeReplaced(key: string) {
				return !key.startsWith(prefix) || (isReserved && isReserved(key));
			}
			const replace = preferredKey && mustBeReplaced(preferredKey);
			if (!key || generatedKeys.has(key) || replace) {
				do {
					key = `${prefix}t${nextPostfix++}`;
				} while (knownKeys.has(key) || mustBeReplaced(key));
			}
			knownKeys.add(key);
			generatedKeys.add(key);
			if (replace) {
				const keys = replacedKeys.get(preferredKey!);
				if (keys) {
					keys.add(key);
				} else {
					replacedKeys.set(preferredKey!, new Set([key]));
				}
			}
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
						type: Diagnostic.Type.DisallowedContent,
						details: {},
						filename: this.filename,
						source: this.source,
						...treeDiagnostics.content
					});
				}
			}

			for (const attributeName of elementConfig.attributes) {
				const value = getAttributeValue(element, attributeName);
				if (value !== undefined && !config.ignoreAttributeValue(value)) {
					attribute.set(attributeName, getUniqueKey(originalAttribute && originalAttribute.get(attributeName)));
				}
				// TODO: Allow keeping ids if attribute is not set.
			}

			if (originalAttribute) {
				for (const [name, key] of originalAttribute) {
					if (name !== "text" && name !== "html" && !elementConfig.attributes.has(name)) {
						diagnostics.report({
							type: Diagnostic.Type.DisallowedLocalizedAttribute,
							details: { key, name },
							filename: this.filename,
							source: this.source,
							...treeDiagnostics.startTag(element)
						});
					}
				}
			}
			const location = element.sourceCodeLocation!;
			let start = 0, end = 0, space: string;
			if (originalAttribute) {
				const attributeLocation = element.sourceCodeLocation!.attrs!.t;
				start = attributeLocation.startOffset;
				end = attributeLocation.endOffset;
				while (/\s/.test(this.source.charAt(start - 1))) {
					start--;
				}
				space = this.source.slice(start, attributeLocation.startOffset);
			} else {
				const tagLocation = location.startTag!;
				start = end = tagLocation.endOffset - 1;
				space = " ";
			}

			if (attribute.isEmpty) {
				commits.push({ start, end, replacement: "" });
			} else {
				commits.push({ start, end, replacement: `${space}t="${attribute}"` })
			}
		}

		for (const key of knownKeys) {
			if (!replacedKeys.has(key) && !key.startsWith(prefix)) {
				diagnostics.report({
					type: Diagnostic.Type.WrongPrefix,
					details: { key, expectedPrefix: prefix },
					filename: this.filename
				});
			}
		}

		commits.sort((a, b) => a.start - b.start);

		let updatedSource = "";
		let sourcePos = 0;
		for (const commit of commits) {
			updatedSource += this.source.slice(sourcePos, commit.start);
			updatedSource += commit.replacement;
			sourcePos = commit.end;
		}
		updatedSource += this.source.slice(sourcePos);

		const modified = this.source !== updatedSource;
		if (!diagnosticsOnly) {
			this.#source = updatedSource;
			this.#root = AureliaTemplateFile.#parseHtml(updatedSource);
		}
		return { modified, replacedKeys };
	}
}

interface JustificationCandidate {
	readonly element: Element;
	readonly elementConfig: Config.LocalizedElement;
	readonly originalAttribute?: AureliaI18nAttribute;
	readonly hasText: boolean;
}

interface JustificationCommit {
	readonly start: number;
	readonly end: number;
	readonly replacement: string;
}
