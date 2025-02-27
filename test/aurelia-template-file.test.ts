import { AureliaTemplateFile, Config, ConfigOptions, createConfig, Diagnostic, ElementContentLocalizationType } from "@netatwork/aurelia-i18n-tools";
import { deepStrictEqual, strictEqual } from "node:assert";
import { join } from "node:path";
import test, { suite } from "node:test";
import { captureDiagnostics, code, expectNoDiagnostics, testDir } from "./utility.js";

await suite("aurelia-template-file", async () => {
	const filename = join(testDir, "template.html");
	const config = createConfig(testDir, {
		src: ".",
		localize: {
			div: {
				content: ElementContentLocalizationType.Text,
				attributes: ["foo", "bar"]
			}
		}
	});

	await test("allocate new keys", () => {
		const source = AureliaTemplateFile.parse(filename, code(`
			<div foo="bar">content</div>
			<div foo=""></div>
		`));
		const result = source.justifyKeys(config, {
			prefix: "test.",
			diagnostics: expectNoDiagnostics(),
		});
		strictEqual(result.modified, true);
		strictEqual(result.replacedKeys.size, 0);
		strictEqual(source.source, code(`
			<div foo="bar" t="test.t0;[foo]test.t1">content</div>
			<div foo="" t="[foo]test.t2"></div>
		`));
	});

	await suite("ignore t attributes by value", async () => {
		await test("extractKeys", () => {
			const source = AureliaTemplateFile.parse(filename, code(`
				<div t="[value]\${foo.bar}"></div>
				<div foo="bar" t="[foo]test.foo"></div>
			`));
			const result = source.extractKeys(config, {
				prefix: "test.",
				diagnostics: expectNoDiagnostics(),
			});
			deepStrictEqual(result, new Map([
				["test.foo", "bar"],
			]));
		});

		await test("justifyKeys", () => {
			const source = AureliaTemplateFile.parse(filename, code(`
				<div t="[value]\${foo.bar}"></div>
				<div foo="bar"></div>
			`));
			const result = source.justifyKeys(config, {
				prefix: "test.",
				diagnostics: expectNoDiagnostics(),
			});
			strictEqual(result.modified, true);
			strictEqual(result.replacedKeys.size, 0);
			strictEqual(source.source, code(`
				<div t="[value]\${foo.bar}"></div>
				<div foo="bar" t="[foo]test.t0"></div>
			`));
		});

		await test("disallowed diagnostic", () => {
			const source = AureliaTemplateFile.parse(filename, code(`
				<test-element t="\${foo.bar}"></test-element>
				<div foo="bar"></div>
			`));
			const diagnostics = captureDiagnostics();
			const result = source.justifyKeys(config, {
				prefix: "test.",
				diagnostics: diagnostics.host,
			});
			strictEqual(result.modified, true);
			strictEqual(result.replacedKeys.size, 0);
			strictEqual(source.source, code(`
				<test-element t="\${foo.bar}"></test-element>
				<div foo="bar" t="[foo]test.t0"></div>
			`));
			strictEqual(diagnostics.all.length, 1);
			strictEqual(diagnostics.all[0].type, Diagnostic.Type.DisallowedTAttribute);
		});
	});

	await test("reuse existing keys", () => {
		const source = AureliaTemplateFile.parse(filename, code(`
			<div foo="bar" t="test.t7">content</div>
		`));
		const result = source.justifyKeys(config, {
			prefix: "test.",
			diagnostics: expectNoDiagnostics()
		});
		strictEqual(result.modified, true);
		strictEqual(result.replacedKeys.size, 0);
		strictEqual(source.source, code(`
			<div foo="bar" t="test.t7;[foo]test.t0">content</div>
		`));
	});

	await test("replace duplicate keys", () => {
		const source = AureliaTemplateFile.parse(filename, code(`
			<div t="test.t7">content</div>
			<div t="test.t7">content</div>
		`));
		const result = source.justifyKeys(config, {
			prefix: "test.",
			diagnostics: expectNoDiagnostics()
		});
		strictEqual(result.modified, true);
		strictEqual(result.replacedKeys.size, 0);
		strictEqual(source.source, code(`
			<div t="test.t7">content</div>
			<div t="test.t0">content</div>
		`));
	});

	await test("replace reserved keys", () => {
		const source = AureliaTemplateFile.parse(filename, code(`
			<div t="test.t7">content</div>
		`));
		const result = source.justifyKeys(config, {
			prefix: "test.",
			diagnostics: expectNoDiagnostics(),
			isReserved: k => k === "test.t7"
		});
		strictEqual(result.modified, true);
		strictEqual(result.replacedKeys.size, 1);
		deepStrictEqual(result.replacedKeys.get("test.t7"), new Set(["test.t0"]));
		strictEqual(source.source, code(`
			<div t="test.t0">content</div>
		`));
	});

	await test("replace keys with wrong prefixes", () => {
		const source = AureliaTemplateFile.parse(filename, code(`
			<div t="foo.t7">content</div>
		`));
		const result = source.justifyKeys(config, {
			prefix: "test.",
			diagnostics: expectNoDiagnostics(),
		});
		strictEqual(result.modified, true);
		strictEqual(result.replacedKeys.size, 1);
		deepStrictEqual(result.replacedKeys.get("foo.t7"), new Set(["test.t0"]));
		strictEqual(source.source, code(`
			<div t="test.t0">content</div>
		`));
	});

	await test("report unlocalized text content", () => {
		const diagnostics = captureDiagnostics();
		const source = AureliaTemplateFile.parse(filename, code(`
			<span>content</span>
		`));
		const result = source.justifyKeys(config, {
			prefix: "test.",
			diagnostics: diagnostics.host
		});
		strictEqual(result.modified, false);
		strictEqual(source.source, code(`
			<span>content</span>
		`));
		deepStrictEqual(diagnostics.all.map(d => d.type), [Diagnostic.Type.UnlocalizedText]);
	});

	await test("keep linebreaks when replacing keys", () => {
		const source = AureliaTemplateFile.parse(filename, code(`
			<div foo="bar"
				t="test.t7"
				baz="boo">content</div>
		`));
		const result = source.justifyKeys(config, {
			prefix: "test.",
			diagnostics: expectNoDiagnostics()
		});
		strictEqual(result.modified, true);
		strictEqual(result.replacedKeys.size, 0);
		strictEqual(source.source, code(`
			<div foo="bar"
				t="test.t7;[foo]test.t0"
				baz="boo">content</div>
		`));
	});

	function assertWhitespaceHandling(whitespace: ConfigOptions["whitespace"], markup: string, expectedValues: string[]) {
		const config = createConfig(testDir, { src: ".", whitespace });
		const source = AureliaTemplateFile.parse(filename, code(markup));
		deepStrictEqual(Array.from(source.extractKeys(config, {
			prefix: "test.",
			diagnostics: expectNoDiagnostics(),
		}).values()), expectedValues);
	}

	await test("preserves whitespace by default", () => {
		assertWhitespaceHandling(
			undefined,
			`
				<div t="t0">  foo  1  </div>
				<div t="[bar]t1" bar="  bar  2  "></div>
			`,
			["  foo  1  ", "  bar  2  "]
		);
	});

	await test("applies whitespace handling to specific attributes", () => {
		assertWhitespaceHandling(
			{
				"*": {
					attributes: {
						"*": Config.WhitespaceHandling.Trim,
						bar: Config.WhitespaceHandling.Collapse
					}
				}
			},
			`
				<div foo="  1  " t="[foo]t0"></div>
				<div bar="  2  " t="[bar]t1"></div>
			`,
			["1", " 2 "]
		);
	});

	await test("applies whitespace handling to specific elements", () => {
		assertWhitespaceHandling(
			{
				"*": Config.WhitespaceHandling.Trim,
				span: Config.WhitespaceHandling.Collapse
			},
			`
				<div t="t0">  1  </div>
				<div foo="  2  " t="[foo]t1"></div>
				<span t="t2">  3  </span>
				<span foo="  4  " t="[foo]t3"></span>
			`,
			["1", "2", " 3 ", " 4 "]
		);
	});

	await test("correctly trims whitespace", () => {
		assertWhitespaceHandling(
			{
				"*": Config.WhitespaceHandling.Trim
			},
			`
				<div t="t0">  foo 1  </div>
				<div t="t1">bar2</div>
			`,
			["foo 1", "bar2"]
		);
	});

	await test("correctly collapses whitespace", () => {
		assertWhitespaceHandling(
			{
				"*": Config.WhitespaceHandling.Collapse
			},
			`
				<div t="t0">  foo  1  </div>
				<div t="t1">bar 2</div>
			`,
			[" foo 1 ", "bar 2"]
		);
	});

	await test("correctly trims and collapses whitespace", () => {
		assertWhitespaceHandling(
			{
				"*": Config.WhitespaceHandling.TrimCollapse
			},
			`
				<div t="t0">  foo  1  </div>
				<div t="t1">bar 2</div>
			`,
			["foo 1", "bar 2"]
		);
	});
});
