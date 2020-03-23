import { parseFragment, DefaultTreeDocumentFragment, DefaultTreeElement } from "parse5";
import { traverseElements, getAttributeValue, analyzeElementContent } from "./utility/parse5-tree";
import { Config, ConfigLocalizedElement, ElementContentLocalizationType } from "./config";
import { AureliaI18nAttribute } from "./aurelia-i18n-attribute";

export class AureliaTemplateFile {
	private constructor(
		private readonly _source: string,
		private readonly _root: DefaultTreeDocumentFragment
	) {}

	public static parse(source: string) {
		return new AureliaTemplateFile(source, parseFragment(source, {
			scriptingEnabled: false,
			sourceCodeLocationInfo: true
		}) as DefaultTreeDocumentFragment);
	}

	/**
	 * Justify localization keys in this template
	 * file and return the updated source code.
	 * @param config
	 * @param prefix
	 */
	public justifyKeys(config: Config, options: JustifyOptions) {
		const knownKeys = new Set<string>();
		const candidates: JustificationCandidate[] = [];

		for (const element of traverseElements(this._root, config.ignoreElement)) {
			const elementConfig = config.localizedElements.get(element.tagName);
			if (elementConfig) {
				const { hasText, hasElements } = analyzeElementContent(element, config.ignoreTextContent);
				if (hasText && hasElements) {
					// TODO: Raise diagnostic that node contains mixed content.
				}

				let originalAttribute: AureliaI18nAttribute | undefined;
				const originalAttributeValue = getAttributeValue(element, "t");
				if (originalAttributeValue) {
					try {
						originalAttribute = AureliaI18nAttribute.parse(originalAttributeValue);
						for (const key of originalAttribute.keys()) {
							knownKeys.add(key);
						}
					} catch {
						// TODO: Raise diagnostic for invalid i18n attribute.
					}
				}

				candidates.push({ element, elementConfig, hasText, originalAttribute });
			} else {
				// TODO: Raise diagnostic if node contains text.
				// TODO: Raise diagnostic if node has an i18n attribute.
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
			} else if (htmlKey) {
				// TODO: Raise diagnostic that html content is localized but not allowed.
				attribute.set("html", htmlKey);
			} else if (textKey) {
				// TODO: Raise diagnostic that text content is localized but not allowed.
				attribute.set("text", textKey);
			} else if (hasText) {
				// TODO: Raise diagnostic that node has text content that is not allowed.
			}

			for (const attributeName of elementConfig.attributes) {
				const value = getAttributeValue(element, attributeName);
				if (value && !config.ignoreAttributeValue(value)) {
					attribute.set(attributeName, getUniqueKey(originalAttribute && originalAttribute.get(attributeName)));
				}
				// TODO: Allow keeping ids if attribute is not set.
			}

			if (originalAttribute) {
				for (const [name] of originalAttribute) {
					if (name !== "text" && name !== "html" && !elementConfig.attributes.has(name)) {
						// TODO: Raise diagnostic that non allowed attribute is already localized.
					}
				}
			}

			for (const key of knownKeys) {
				if (!key.startsWith(options.prefix)) {
					// TODO: Raise diagnostic that keys have not been updated after a file was renamed.
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
