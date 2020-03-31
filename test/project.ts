import test from "ava";
import * as path from "path";
import { Project, createConfig, AureliaTemplateFile, ElementContentLocalizationType, TranslationData } from "../src";
import { code, handleModified } from "./_utility";

test("justify sources and update translation data", async t => {
	const config = createConfig(__dirname, {
		src: ".",
		prefix: "app.",
		localize: {
			div: { content: ElementContentLocalizationType.Text }
		}
	});

	const project = new Project({
		config,
		development: true
	});

	const filename = path.join(__dirname, "test.html");
	project.updateSource(AureliaTemplateFile.parse(filename, code(`
		<template>
			<div>test</div>
		</template>
	`)));

	project.processSources({
		enforcePrefix: true
	});

	const { sources, translationData } = await handleModified(project);

	t.is(sources.size, 1);
	t.is(sources.get(filename), code(`
		<template>
			<div t="app.test.t0">test</div>
		</template>
	`));

	t.is(translationData!.files.get(filename)!.content.get("app.test.t0")!.source.content, "test");
});

test("use existing translations for reserved keys", async t => {
	const config = createConfig(__dirname, {
		src: ".",
		prefix: "app.",
		localize: {
			div: { content: ElementContentLocalizationType.Text }
		}
	});

	const project = new Project({
		config,
		development: true
	});

	const filename1 = path.join(__dirname, "foo/test.html");
	project.updateSource(AureliaTemplateFile.parse(filename1, code(`
		<template>
			<div t="app.test.t0">test</div>
		</template>
	`)));

	const filename2 = path.join(__dirname, "bar/test.html");
	project.updateSource(AureliaTemplateFile.parse(filename2, code(`
		<template>
			<div t="app.test.t0">test</div>
		</template>
	`)));

	project.translationData.files.set(filename2, {
		content: new Map([
			["app.test.t0", {
				source: <TranslationData.Translation> {
					content: "test",
					lastModified: Date.now(),
					ignoreSpelling: []
				},
				translations: new Map([
					["de", <TranslationData.Translation> {
						content: "translation",
						lastModified: Date.now(),
						ignoreSpelling: []
					}]
				])
			}]
		])
	});

	project.processSources({
		enforcePrefix: true
	});

	const { sources, translationData } = await handleModified(project);

	t.is(sources.size, 1);
	t.is(sources.get(filename1), code(`
		<template>
			<div t="app.test.t1">test</div>
		</template>
	`));

	t.true(translationData!.files.get(filename1)!.content.get("app.test.t1")!.translations.has("de"));
});

test("use existing translations for replaced prefixes", async t => {
	const config = createConfig(__dirname, {
		src: ".",
		prefix: "app.",
		localize: {
			div: { content: ElementContentLocalizationType.Text }
		}
	});

	const project = new Project({
		config,
		development: true
	});

	const filename1 = path.join(__dirname, "test.html");
	project.updateSource(AureliaTemplateFile.parse(filename1, code(`
		<template>
			<div t="app.foo.t0">test</div>
		</template>
	`)));

	project.translationData.files.set(path.join(__dirname, "foo.html"), {
		content: new Map([
			["app.foo.t0", {
				source: <TranslationData.Translation> {
					content: "test",
					lastModified: Date.now(),
					ignoreSpelling: []
				},
				translations: new Map([
					["de", <TranslationData.Translation> {
						content: "translation",
						lastModified: Date.now(),
						ignoreSpelling: []
					}]
				])
			}]
		])
	});

	project.processSources({
		enforcePrefix: true
	});

	const { sources, translationData } = await handleModified(project);

	t.is(sources.size, 1);
	t.is(sources.get(filename1), code(`
		<template>
			<div t="app.test.t0">test</div>
		</template>
	`));

	t.true(translationData!.files.get(filename1)!.content.get("app.test.t0")!.translations.has("de"));
});
