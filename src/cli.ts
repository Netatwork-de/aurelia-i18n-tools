#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

import parse from "yargs-parser";

import { Project } from "./project.js";
import { ConfigOptions, createConfig } from "./config.js";

(async () => {
	const args = parse(process.argv.slice(2), {
		boolean: ["dev", "verbose"],
		string: ["config"],
		alias: {
			config: "c",
			dev: "d",
			verbose: "v",
		},
	});
	const development = args.dev ?? false;
	const verbose = args.verbose ?? false;

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
	await project.run();
})().catch(error => {
	console.error(error);
	process.exit(1);
});
