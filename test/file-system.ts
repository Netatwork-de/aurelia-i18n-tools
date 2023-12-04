import test from "ava";
import { deduplicateModuleFilenames } from "../src/utility/file-system.js";

test("deduplicateModuleFilenames", t => {
	const filenames = deduplicateModuleFilenames([
		"/foo/bar",
		"/foo/node_modules/test/a",
		"/foo/bar/node_modules/test/a",
		"/bar/node_modules/test/b",
		"/bar/foo/node_modules/test/b",
	]);
	filenames.sort();
	t.deepEqual(filenames, [
		"/bar/foo/node_modules/test/b",
		"/foo/bar",
		"/foo/bar/node_modules/test/a",
	]);
});
