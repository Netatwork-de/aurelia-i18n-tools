import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ExecutionContext } from "ava";

import { Diagnostics, Diagnostic, Project, TranslationData } from "../src/index.js";

export function expectNoDiagnostics(t: ExecutionContext) {
	const host = new Diagnostics();
	host.on("report", diagnostic => {
		t.fail(`Unexpected diagnostic: ${diagnostic.type}`);
	});
	return host;
}

export function captureDiagnostics() {
	const all: Diagnostic<any>[] = [];
	const host = new Diagnostics();
	host.on("report", diagnostic => {
		all.push(diagnostic);
	});
	return { host, all };
}

export async function handleModified(project: Project) {
	const sources = new Map<string, string>();
	let translationData: TranslationData | undefined;
	await project.handleModified({
		writeSource(source) {
			sources.set(source.filename, source.source);
		},
		writeTranslationData(data) {
			translationData = data;
		}
	});
	return { sources, translationData };
}

export function code(code: string) {
	let indentation: number | undefined = undefined;
	return code.split("\n").map(line => {
		if (indentation === undefined) {
			const match = /^(\s*)(.*)$/.exec(line);
			if (match && match[2]) {
				indentation = match[1].length;
			}
		}
		return line.slice(indentation);
	}).join("\n").trim();
}

export const testDir = join(fileURLToPath(import.meta.url), "..");
