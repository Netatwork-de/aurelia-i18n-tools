import { DefaultTreeNode, DefaultTreeElement, DefaultTreeParentNode } from "parse5";
import * as adapter from "parse5/lib/tree-adapters/default";
import { DiagnosticLocationPair, DiagnosticLocation } from "../diagnostics";

const IGNORED_NODE_NAMES = new Set(["#comment", "#documentType", "#text"]);

export function * traverseElements(node: DefaultTreeNode, ignoreTagNames: (tagName: string) => boolean): Generator<DefaultTreeElement> {
	if (IGNORED_NODE_NAMES.has(node.nodeName)) {
		return;
	}
	if (adapter.isElementNode(node)) {
		if (ignoreTagNames(node.tagName)) {
			return;
		}
		yield node;
		if (node.nodeName === "template") {
			yield * traverseElements(adapter.getTemplateContent(node), ignoreTagNames);
		}
	}
	if (isParentNode(node)) {
		for (const childNode of node.childNodes) {
			yield * traverseElements(childNode, ignoreTagNames);
		}
	}
}

export function isParentNode(node: DefaultTreeNode): node is DefaultTreeParentNode {
	return Array.isArray((node as DefaultTreeParentNode).childNodes);
}

export function getAttributeValue(element: DefaultTreeElement, name: string): string | undefined {
	for (const attribute of element.attrs) {
		if (attribute.name === name) {
			return attribute.value;
		}
	}
}

export function analyzeElementContent(element: DefaultTreeElement, ignoreTextContent: (textContent: string) => boolean) {
	let text = "";
	let hasText = false;
	let hasElements = false;
	for (const node of element.childNodes) {
		if (adapter.isTextNode(node)) {
			const content = adapter.getTextNodeContent(node);
			if (content.trim() && !ignoreTextContent(content)) {
				text += content;
				hasText = true;
			}
		} else if (adapter.isElementNode(node)) {
			hasElements = true;
		}
		if (hasText && hasElements) {
			break;
		}
	}
	return { text, hasText, hasElements };
}

export namespace treeDiagnostics {
	export function content(element: DefaultTreeElement): DiagnosticLocationPair {
		const info = element.sourceCodeLocation!;
		return {
			start: {
				offset: info.startTag.endOffset,
				line: info.startTag.endLine,
				col: info.startTag.endCol
			},
			end: {
				offset: info.endTag.startOffset,
				line: info.endTag.startLine,
				col: info.endTag.startCol
			}
		};
	}

	export function attribute(element: DefaultTreeElement, name: string): DiagnosticLocationPair {
		const info = element.sourceCodeLocation!.attrs[name];
		return {
			start: {
				offset: info.startOffset,
				line: info.startLine,
				col: info.startCol
			},
			end: {
				offset: info.endOffset,
				line: info.endLine,
				col: info.endCol
			}
		};
	}

	export function startTag(element: DefaultTreeElement): DiagnosticLocationPair {
		const info = element.sourceCodeLocation!.startTag;
		return {
			start: {
				offset: info.startOffset,
				line: info.startLine,
				col: info.startCol
			},
			end: {
				offset: info.endOffset,
				line: info.endLine,
				col: info.endCol
			}
		};
	}
}
