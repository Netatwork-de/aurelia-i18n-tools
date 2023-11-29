import { join } from "node:path";

import test, { ExecutionContext } from "ava";

import { expectNoDiagnostics, code, captureDiagnostics, testDir } from "./_utility.js";
import { AureliaTemplateFile, createConfig, ElementContentLocalizationType, Diagnostic, Config, ConfigOptions } from "../src/index.js";

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

test("allocate new keys", t => {
	const source = AureliaTemplateFile.parse(filename, code(`
		<div foo="bar">content</div>
		<div foo=""></div>
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.",
		diagnostics: expectNoDiagnostics(t)
	});
	t.true(result.modified);
	t.is(result.replacedKeys.size, 0);
	t.is(source.source, code(`
		<div foo="bar" t="test.t0;[foo]test.t1">content</div>
		<div foo="" t="[foo]test.t2"></div>
	`));
});

test("reuse existing keys", t => {
	const source = AureliaTemplateFile.parse(filename, code(`
		<div foo="bar" t="test.t7">content</div>
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.",
		diagnostics: expectNoDiagnostics(t)
	});
	t.true(result.modified);
	t.is(result.replacedKeys.size, 0);
	t.is(source.source, code(`
		<div foo="bar" t="test.t7;[foo]test.t0">content</div>
	`));
});

test("replace duplicate keys", t => {
	const source = AureliaTemplateFile.parse(filename, code(`
		<div t="test.t7">content</div>
		<div t="test.t7">content</div>
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.",
		diagnostics: expectNoDiagnostics(t)
	});
	t.true(result.modified);
	t.is(result.replacedKeys.size, 0);
	t.is(source.source, code(`
		<div t="test.t7">content</div>
		<div t="test.t0">content</div>
	`));
});

test("replace reserved keys", t => {
	const source = AureliaTemplateFile.parse(filename, code(`
		<div t="test.t7">content</div>
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.",
		diagnostics: expectNoDiagnostics(t),
		isReserved: k => k === "test.t7"
	});
	t.true(result.modified);
	t.is(result.replacedKeys.size, 1);
	t.deepEqual(result.replacedKeys.get("test.t7"), new Set(["test.t0"]));
	t.is(source.source, code(`
		<div t="test.t0">content</div>
	`));
});

test("replace keys with wrong prefixes", t => {
	const source = AureliaTemplateFile.parse(filename, code(`
		<div t="foo.t7">content</div>
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.",
		diagnostics: expectNoDiagnostics(t),
	});
	t.true(result.modified);
	t.is(result.replacedKeys.size, 1);
	t.deepEqual(result.replacedKeys.get("foo.t7"), new Set(["test.t0"]));
	t.is(source.source, code(`
		<div t="test.t0">content</div>
	`));
});

test("report unlocalized text content", t => {
	const diagnostics = captureDiagnostics();
	const source = AureliaTemplateFile.parse(filename, code(`
		<span>content</span>
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.",
		diagnostics: diagnostics.host
	});
	t.false(result.modified);
	t.is(source.source, code(`
		<span>content</span>
	`));
	t.deepEqual(diagnostics.all.map(d => d.type), [Diagnostic.Type.UnlocalizedText]);
});

test("keep linebreaks when replacing keys", t => {
	const source = AureliaTemplateFile.parse(filename, code(`
		<div foo="bar"
			t="test.t7"
			baz="boo">content</div>
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.",
		diagnostics: expectNoDiagnostics(t)
	});
	t.true(result.modified);
	t.is(result.replacedKeys.size, 0);
	t.is(source.source, code(`
		<div foo="bar"
			t="test.t7;[foo]test.t0"
			baz="boo">content</div>
	`));
});

function whitespaceHandling(t: ExecutionContext, whitespace: ConfigOptions["whitespace"], markup: string, expectedValues: string[]) {
	const config = createConfig(testDir, { src: ".", whitespace });
	const source = AureliaTemplateFile.parse(filename, code(markup));
	t.deepEqual(Array.from(source.extractKeys(config).values()), expectedValues);
}

test("preserves whitespace by default", whitespaceHandling, undefined, `
	<div t="t0">  foo  1  </div>
	<div t="[bar]t1" bar="  bar  2  "></div>
`, ["  foo  1  ", "  bar  2  "]);

test("applies whitespace handling to specific attributes", whitespaceHandling, {
	"*": {
		attributes: {
			"*": Config.WhitespaceHandling.Trim,
			bar: Config.WhitespaceHandling.Collapse
		}
	}
}, `
	<div foo="  1  " t="[foo]t0"></div>
	<div bar="  2  " t="[bar]t1"></div>
`, ["1", " 2 "]);

test("applies whitespace handling to specific elements", whitespaceHandling, {
	"*": Config.WhitespaceHandling.Trim,
	span: Config.WhitespaceHandling.Collapse
}, `
	<div t="t0">  1  </div>
	<div foo="  2  " t="[foo]t1"></div>
	<span t="t2">  3  </span>
	<span foo="  4  " t="[foo]t3"></span>
`, ["1", "2", " 3 ", " 4 "]);

test("correctly trims whitespace", whitespaceHandling, {
	"*": Config.WhitespaceHandling.Trim
}, `
	<div t="t0">  foo 1  </div>
	<div t="t1">bar2</div>
`, ["foo 1", "bar2"]);

test("correctly collapses whitespace", whitespaceHandling, {
	"*": Config.WhitespaceHandling.Collapse
}, `
	<div t="t0">  foo  1  </div>
	<div t="t1">bar 2</div>
`, [" foo 1 ", "bar 2"]);

test("correctly trims and collapses whitespace", whitespaceHandling, {
	"*": Config.WhitespaceHandling.TrimCollapse
}, `
	<div t="t0">  foo  1  </div>
	<div t="t1">bar 2</div>
`, ["foo 1", "bar 2"]);
