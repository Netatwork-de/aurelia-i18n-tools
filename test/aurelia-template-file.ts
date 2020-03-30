import test from "ava";
import * as path from "path";
import { AureliaTemplateFile, createConfig, ElementContentLocalizationType, Diagnostic, Diagnostics } from "../src";
import { expectNoDiagnostics, code, captureDiagnostics } from "./_utility";

const filename = path.join(__dirname, "template.html");
const config = createConfig(__dirname, {
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
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.t",
		diagnostics: expectNoDiagnostics(t)
	});
	t.true(result.modified);
	t.is(result.replacedKeys.size, 0);
	t.is(source.source, code(`
		<div foo="bar" t="test.t0;[foo]test.t1">content</div>
	`));
});

test("reuse existing keys", t => {
	const source = AureliaTemplateFile.parse(filename, code(`
		<div foo="bar" t="test.t7">content</div>
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.t",
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
		prefix: "test.t",
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
		prefix: "test.t",
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
		prefix: "test.t",
		diagnostics: expectNoDiagnostics(t),
		enforcePrefix: true
	});
	t.true(result.modified);
	t.is(result.replacedKeys.size, 1);
	t.deepEqual(result.replacedKeys.get("foo.t7"), new Set(["test.t0"]));
	t.is(source.source, code(`
		<div t="test.t0">content</div>
	`));
});

test("report unlocalized whitespace", t => {
	const diagnostics = captureDiagnostics();
	const source = AureliaTemplateFile.parse(filename, code(`
		<span>content</span>
	`));
	const result = source.justifyKeys(config, {
		prefix: "test.t",
		diagnostics: diagnostics.host
	});
	t.false(result.modified);
	t.is(source.source, code(`
		<span>content</span>
	`));
	t.deepEqual(diagnostics.all.map(d => d.type), [Diagnostic.Type.UnlocalizedText]);
});
