import { TranslationData } from "@netatwork/aurelia-i18n-tools";
import { strictEqual } from "node:assert";
import { join } from "node:path";
import test, { suite } from "node:test";
import { testDir } from "./utility.js";

await suite("translation-data", async () => {
	await test("parse v1", () => {
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
		}), testDir);


		strictEqual(data.parsedVersion, 1);

		const file = data.files.get(join(testDir, "src/test.html"))!;
		strictEqual(file.content.has("test.t0"), true);
	});

	await test("parse v2", () => {
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
		}), testDir);

		strictEqual(data.parsedVersion, 2);

		const file = data.files.get(join(testDir, "src/test.html"))!;
		strictEqual(file.content.get("test.t0")!.source.content, "foo");
		strictEqual(file.content.get("test.t0")!.translations.get("de")!.content, "bar");

		strictEqual(data.obsolete.length, 1);
		strictEqual(data.obsolete[0].content, "bar");
		strictEqual(data.obsolete[0].translations.get("de"), "baz");
	});

	await test("stringify", () => {
		var data = new TranslationData(new Map<string, TranslationData.File>([
			[join(testDir, "src/test.html"), {
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

		const json: TranslationData.JsonV2 = JSON.parse(data.formatJson(testDir));
		strictEqual(json.version, 2);
		strictEqual(json.files["src/test.html"].content["test.t0"].content, "foo");
		strictEqual(json.files["src/test.html"].content["test.t0"].translations["de"].content, "bar");

		strictEqual(json.obsolete.length, 2);
		strictEqual(json.obsolete[0].content, "bar");
		strictEqual(json.obsolete[0].translations["de"], "baz");
		strictEqual(json.obsolete[1].content, "bar");
		strictEqual(json.obsolete[1].translations["de"], "foo");
	});
});
