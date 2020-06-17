import test from "ava";
import { join } from "path";
import { TranslationData } from "../src";

test("parse v1", t => {
	var data = TranslationData.parse(JSON.stringify(<TranslationData.JsonV1> {
		"src/test.html": {
			content: {
				"test.t0": {
					content: "foo",
					ignoreSpelling: [],
					lastModified: "2020-06-17T08:04:10.519Z",
					translations: {}
				}
			}
		}
	}), __dirname);

	t.is(data.parsedVersion, 1);

	const file = data.files.get(join(__dirname, "src/test.html"))!;
	t.true(file.content.has("test.t0"));
});

test("parse v2", t => {
	var data = TranslationData.parse(JSON.stringify(<TranslationData.JsonV2> {
		version: 2,
		files: {
			"src/test.html": {
				content: {
					"test.t0": {
						content: "foo",
						ignoreSpelling: [],
						lastModified: "2020-06-17T08:04:10.519Z",
						translations: {
							"de": {
								content: "bar",
								ignoreSpelling: [],
								lastModified: "2020-06-17T08:04:10.519Z"
							}
						}
					}
				}
			}
		},
		obsolete: [
			{
				content: "bar",
				translations: {
					"de": "baz"
				}
			}
		]
	}), __dirname);

	t.is(data.parsedVersion, 2);

	const file = data.files.get(join(__dirname, "src/test.html"))!;
	t.is(file.content.get("test.t0")!.source.content, "foo");
	t.is(file.content.get("test.t0")!.translations.get("de")!.content, "bar");

	t.is(data.obsolete.length, 1);
	t.is(data.obsolete[0].content, "bar");
	t.is(data.obsolete[0].translations.get("de"), "baz");
});

test("stringify", t => {
	var data = new TranslationData(new Map<string, TranslationData.File>([
		[join(__dirname, "src/test.html"), {
			content: new Map<string, TranslationData.TranslationSet>([
				["test.t0", {
					source: {
						content: "foo",
						lastModified: Date.now(),
						ignoreSpelling: []
					},
					translations: new Map([
						["de", {
							content: "bar",
							lastModified: Date.now(),
							ignoreSpelling: []
						}]
					])
				}]
			])
		}]
	]), [
		{
			content: "bar",
			translations: new Map<string, string>([
				["de", "baz"]
			])
		},
		{
			content: "bar",
			translations: new Map<string, string>([
				["de", "baz"]
			])
		},
		{
			content: "bar",
			translations: new Map<string, string>([
				["de", "foo"]
			])
		}
	]);

	const json: TranslationData.JsonV2 = JSON.parse(data.formatJson(__dirname));
	t.is(json.version, 2);
	t.is(json.files["src/test.html"].content["test.t0"].content, "foo");
	t.is(json.files["src/test.html"].content["test.t0"].translations["de"].content, "bar");

	t.is(json.obsolete.length, 2);
	t.is(json.obsolete[0].content, "bar");
	t.is(json.obsolete[0].translations["de"], "baz");
	t.is(json.obsolete[1].content, "bar");
	t.is(json.obsolete[1].translations["de"], "foo");
});
