import { AureliaTemplateFile, createConfig, ElementContentLocalizationType, Project } from "@netatwork/aurelia-i18n-tools";
import { strictEqual } from "node:assert";
import { join } from "node:path";
import test, { suite } from "node:test";
import { code, handleModified, testDir } from "./utility.js";

await suite("project", async () => {
	await test("justify sources and update translation data", async () => {
		const config = createConfig(testDir, {
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

		const filename = join(testDir, "test.html");
		project.updateSource(AureliaTemplateFile.parse(filename, code(`
			<template>
				<div>test</div>
			</template>
		`)));

		project.processSources();

		const { sources, translationData } = await handleModified(project);

		strictEqual(sources.size, 1);
		strictEqual(sources.get(filename), code(`
			<template>
				<div t="app.test.t0">test</div>
			</template>
		`));

		strictEqual(translationData!.files.get(filename)!.content.get("app.test.t0")!.source.content, "test");
	});

	await test("use fallback for unknown elements", async () => {
		const config = createConfig(testDir, {
			src: ".",
			prefix: "app.",
			localize: {
				"*": { content: ElementContentLocalizationType.Text },
				"div": { },
				"input": { attributes: ["placeholder"] },
			}
		});

		const project = new Project({
			config,
			development: true
		});

		const filename = join(testDir, "test.html");
		project.updateSource(AureliaTemplateFile.parse(filename, code(`
			<template>
				<div>foo</div>
				<span>bar</span>
				<input placeholder="baz">
			</template>
		`)));

		project.processSources();

		const { sources } = await handleModified(project);

		strictEqual(sources.size, 1);
		strictEqual(sources.get(filename), code(`
			<template>
				<div>foo</div>
				<span t="app.test.t0">bar</span>
				<input placeholder="baz" t="[placeholder]app.test.t1">
			</template>
		`));
	});

	await test("skip adding removed translations to obsolete items if no translations exist", async () => {
		const config = createConfig(testDir, {
			src: ".",
			prefix: "app.",
			localize: {
				div: { content: ElementContentLocalizationType.Text }
			}
		});
		const project = new Project({ config, development: true });

		const filename1 = join(testDir, "test1.html");
		project.updateSource(AureliaTemplateFile.parse(filename1, code(`
			<template>
				<div>foo</div>
			</template>
		`)));

		const filename2 = join(testDir, "test2.html");
		project.updateSource(AureliaTemplateFile.parse(filename2, code(`
			<template>
				<div>bar</div>
			</template>
		`)));

		project.processSources();
		await handleModified(project);

		project.deleteSource(filename1);
		project.updateSource(AureliaTemplateFile.parse(filename2, code(`
			<template></template>
		`)));

		project.processSources();

		const { translationData } = await handleModified(project);
		strictEqual(translationData!.obsolete.length, 0);
	});

	await test("add removed translations to obsolete items if translations exist", async () => {
		const config = createConfig(testDir, {
			src: ".",
			prefix: "app.",
			localize: {
				div: { content: ElementContentLocalizationType.Text }
			}
		});
		const project = new Project({ config, development: true });

		const filename1 = join(testDir, "test1.html");
		project.updateSource(AureliaTemplateFile.parse(filename1, code(`
			<template>
				<div>foo</div>
			</template>
		`)));

		const filename2 = join(testDir, "test2.html");
		project.updateSource(AureliaTemplateFile.parse(filename2, code(`
			<template>
				<div>bar</div>
			</template>
		`)));

		project.processSources();
		await handleModified(project);

		project.translationData.files.get(filename1)!.content.get("app.test1.t0")!.translations.set("de", {
			content: "Foo",
			ignoreSpelling: [],
			lastModified: Date.now()
		});

		project.translationData.files.get(filename2)!.content.get("app.test2.t0")!.translations.set("de", {
			content: "Bar",
			ignoreSpelling: [],
			lastModified: Date.now()
		});

		project.deleteSource(filename1);
		project.updateSource(AureliaTemplateFile.parse(filename2, code(`
			<template></template>
		`)));

		project.processSources();

		const { translationData } = await handleModified(project);
		strictEqual(translationData!.obsolete.length, 2);
		strictEqual(translationData!.obsolete[0].content, "bar");
		strictEqual(translationData!.obsolete[1].content, "foo");
	});

	await test("use existing translations for reserved keys", async () => {
		const config = createConfig(testDir, {
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

		const filename1 = join(testDir, "foo/test.html");
		project.updateSource(AureliaTemplateFile.parse(filename1, code(`
			<template>
				<div t="app.test.t0">test</div>
			</template>
		`)));

		const filename2 = join(testDir, "bar/test.html");
		project.updateSource(AureliaTemplateFile.parse(filename2, code(`
			<template>
				<div t="app.test.t0">test</div>
			</template>
		`)));

		project.translationData.files.set(filename2, {
			content: new Map([
				["app.test.t0", {
					source: {
						content: "test",
						lastModified: Date.now(),
						ignoreSpelling: []
					},
					translations: new Map([
						["de", {
							content: "translation",
							lastModified: Date.now(),
							ignoreSpelling: []
						}]
					])
				}]
			])
		});

		project.processSources();

		const { sources, translationData } = await handleModified(project);

		strictEqual(sources.size, 1);
		strictEqual(sources.get(filename1), code(`
			<template>
				<div t="app.test.t1">test</div>
			</template>
		`));

		strictEqual(translationData!.files.get(filename1)!.content.get("app.test.t1")!.translations.has("de"), true);
	});

	await test("use existing translations for replaced prefixes", async () => {
		const config = createConfig(testDir, {
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

		const filename1 = join(testDir, "test.html");
		project.updateSource(AureliaTemplateFile.parse(filename1, code(`
			<template>
				<div t="app.foo.t0">test</div>
			</template>
		`)));

		project.translationData.files.set(join(testDir, "foo.html"), {
			content: new Map([
				["app.foo.t0", {
					source: {
						content: "test",
						lastModified: Date.now(),
						ignoreSpelling: []
					},
					translations: new Map([
						["de", {
							content: "translation",
							lastModified: Date.now(),
							ignoreSpelling: []
						}]
					])
				}]
			])
		});

		project.processSources();

		const { sources, translationData } = await handleModified(project);

		strictEqual(sources.size, 1);
		strictEqual(sources.get(filename1), code(`
			<template>
				<div t="app.test.t0">test</div>
			</template>
		`));

		strictEqual(translationData!.files.get(filename1)!.content.get("app.test.t0")!.translations.has("de"), true);
	});

	await test("prefixes", () => {
		const config = createConfig(testDir, { src: "src", prefix: "app." });
		const project = new Project({ config });

		function getPrefix(name: string) {
			return project.getPrefix(join(testDir, name));
		}

		strictEqual(getPrefix("src/test.html"), "app.test.");
		strictEqual(getPrefix("src/test/index.html"), "app.test.");
		strictEqual(getPrefix("src/Test/index.html"), "app.test.");
		strictEqual(getPrefix("src/foo-bar.html"), "app.foo-bar.");
		strictEqual(getPrefix("src/fooBar.html"), "app.foo-bar.");
		strictEqual(getPrefix("src/fooBarBaz.html"), "app.foo-bar-baz.");
		strictEqual(getPrefix("src/fooBAR.html"), "app.foo-bar.");
		strictEqual(getPrefix("src/foo.bar.html"), "app.foo.bar.");
	});
});
