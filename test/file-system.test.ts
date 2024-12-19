import { deepStrictEqual } from "assert";
import { suite, test } from "node:test";
import { deduplicateModuleFilenames } from "../dist/utility/file-system.js";

await suite("file-system", async () => {
	await test("deduplicateModuleFilenames", () => {
		const filenames = deduplicateModuleFilenames([
			"/foo/bar",
			"/foo/node_modules/test/a",
			"/foo/bar/node_modules/test/a",
			"/bar/node_modules/test/b",
			"/bar/foo/node_modules/test/b",
		]);
		filenames.sort();
		deepStrictEqual(filenames, [
			"/bar/foo/node_modules/test/b",
			"/foo/bar",
			"/foo/bar/node_modules/test/a",
		]);
	});
});

