
declare module "parse5/lib/tree-adapters/default" {
	import * as lib from "parse5";

	interface DefaultTreeAdapter extends lib.TreeAdapter {
		createDocument(): lib.DefaultTreeDocument;
		createDocumentFragment(): lib.DefaultTreeDocumentFragment;
		createElement(tagName: string, namespaceURI: string, attrs: lib.Attribute[]): lib.DefaultTreeElement;
		createCommentNode(data: string): lib.DefaultTreeCommentNode;
		appendChild(parentNode: lib.DefaultTreeParentNode, newNode: lib.DefaultTreeNode): void;
		insertBefore(parentNode: lib.DefaultTreeParentNode, newNode: lib.DefaultTreeNode, referenceNode: lib.DefaultTreeNode): void;
		setTemplateContent(templateElement: lib.DefaultTreeElement, contentElement: lib.DefaultTreeDocumentFragment): void;
		getTemplateContent(templateElement: lib.DefaultTreeElement): lib.DefaultTreeDocumentFragment;
		setDocumentType(document: lib.DefaultTreeDocument, name: string, publicId: string, systemId: string): void;
		setDocumentMode(document: lib.DefaultTreeDocument, mode: lib.DocumentMode): void;
		getDocumentMode(document: lib.DefaultTreeDocument): lib.DocumentMode;
		detachNode(node: lib.DefaultTreeNode): void;
		insertText(parentNode: lib.DefaultTreeParentNode, text: string): void;
		insertTextBefore(parentNode: lib.DefaultTreeParentNode, text: string, referenceNode: lib.DefaultTreeNode): void;
		adoptAttributes(recipient: lib.DefaultTreeElement, attrs: lib.Attribute[]): void;
		getFirstChild(node: lib.DefaultTreeParentNode): lib.DefaultTreeNode;
		getChildNodes(node: lib.DefaultTreeParentNode): lib.DefaultTreeNode[];
		getParentNode(node: lib.DefaultTreeChildNode): lib.DefaultTreeParentNode;
		getAttrList(element: lib.DefaultTreeElement): lib.Attribute[];
		getTagName(element: lib.DefaultTreeElement): string;
		getNamespaceURI(element: lib.DefaultTreeElement): string;
		getTextNodeContent(textNode: lib.DefaultTreeTextNode): string;
		getCommentNodeContent(commentNode: lib.DefaultTreeCommentNode): string;
		getDocumentTypeNodeName(doctypeNode: lib.DocumentType): string;
		getDocumentTypeNodePublicId(doctypeNode: lib.DocumentType): string;
		getDocumentTypeNodeSystemId(doctypeNode: lib.DocumentType): string;
		isTextNode(node: lib.DefaultTreeNode): node is lib.DefaultTreeTextNode;
		isCommentNode(node: lib.DefaultTreeNode): node is lib.DefaultTreeCommentNode;
		isDocumentTypeNode(node: lib.DefaultTreeNode): node is lib.DefaultTreeDocumentType;
		isElementNode(node: lib.DefaultTreeNode): node is lib.DefaultTreeElement;
	}

	const adapter: DefaultTreeAdapter;
	export = adapter;
}
