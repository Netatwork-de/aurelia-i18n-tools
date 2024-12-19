#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import parse from "yargs-parser";
import { ConfigOptions, createConfig } from "./config.js";
import { Project } from "./project.js";

(async () => {
	const args = parse(process.argv.slice(2), {
		boolean: [
			"dev",
			"watch",
			"verbose",
			"externals",
		],
		string: ["config"],
		alias: {
			config: "c",
			dev: "d",
			watch: "w",
			verbose: "v",
		},
	});

	const development = Boolean(args.dev ?? false);
	const watch = Boolean(args.watch ?? development);
	const verbose = Boolean(args.verbose ?? false);
	const externals = Boolean(args.externals ?? true);

	const configFilename = resolve(args.config ?? "i18n-config.mjs");
	if (verbose) {
		console.log("Using config file:", relative(process.cwd(), configFilename));
	}

	let options: ConfigOptions;
	switch (extname(configFilename)) {
		case ".js":
		case ".mjs":
		case ".cjs":
			options = (await import(pathToFileURL(configFilename).href)).default;
			break;

		case ".json":
			options = JSON.parse(await readFile(configFilename, "utf8"));
			break;

		default: throw new Error(`Unsupported config file type: ${extname(configFilename)}`);
	}

	if (verbose) {
		console.log("Using config options:", JSON.stringify(options, null, "    "));
	}

	const config = createConfig(dirname(configFilename), options);
	const project = new Project({ config, development });
	project.reportDiagnosticsToConsole();
	await project.run({ watch, externals });
})().catch(error => {
	console.error(error);
	process.exit(1);
});
