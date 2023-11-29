# @netatwork/aurelia-i18n-tools
A toolchain to help with localization in aurelia projects.

## Installation
```shell
npm i -D @netatwork/aurelia-i18n-tools
```

## Configuration
The configuration is usually defined in an es module called **i18n-config.mjs** in the package root directory. All relative file paths are resolved relative to the config files directory.
```js
// i18n-config.mjs
import { defineConfig } from "@netatwork/aurelia-i18n-tools";

// "defineConfig" helps with auto completion, but is not required:
export default defineConfig({
  // This object contains all the config options.
  // All fields are optional with the defaults specified below unless specified otherwise.

  // The root directory for template and resource files:
  src: "./src",

  // The filename of the translation data file:
  translationData: "./i18n.json",

  // The filename template for compiled locale data.
  // The "[locale]" placeholder is replaced with the locale name.
  output: "./dist/[locale]/translation.json",

  // A prefix for translation ids.
  // Default is an empty string.
  prefix: "example.",

  // The locale used in source files.
  sourceLocale: "en",

  // An array of rules to control what is not localized:
  // By default, nothing is ignored.
  // Matching patterns can be strings, regular expressions or functions.
  ignore: [
    // Matches <not-localized-example> elements and it's children:
    { element: "not-localized-example" },

    // Matches the complete text content "Hello World!":
    // Text content with interpolation is ignored automatically.
    { textContent: "Hello World!" },

    // Matches attributes with the value "example":
    { attributeValue: "example" },
  ],

  // An object to specify what elements and attributes are localized:
  // By default, nothing is localized.
  localize: {
    "example-element": {
      // Element content is not localized (default):
      content: "none",
      // Localize the element content as inner html:
      content: "html",
      // Localize the element content as inner text.
      content: "text",

      // An array of localized attribute names:
      attributes: ["value", "title"],
    },

    // "*" matches all elements:
    "*": { ... },
  },

  // An object to specify how whitespace is handled when extracting localized fragments:
  whitespace: {
    "example-element": {
      // An object to specify how whitespace is handled for specific attributes:
      attributes: {
        // Extract whitespace as is:
        value: "preserve",
        // Only trim leading and trailing whitespace:
        value: "trim",
        // Collapse leading, trailing and whitespace in between text to a single space:
        value: "collapse",
        // Trim and collapse:
        value: "trim-collapse",

        // "*" matches all attributes:
        "*": "preserve",
      },

      // Specify how whitespace is handled for element content:
      content: "preserve",
    },

    // "*" matches all elements:
    "*": {},
  },

  // Specify how diagnostics are handled:
  // By default, all diagnostics are treated as warnings.
  // Values can be "ignore", "warn" or "error".
  // See "src/diagnostics.ts" for a list of possible diagnostics.
  diagnostics: {
    "invalid-json-data": "error",
    // "all" is a fallback for unconfigured diagnostics:
    all: "warn",
  },

  // An object with locales and patterns to include external locale data:
  externalLocales: {
    en: ["./node_modules/@some-namespace/*/dist/en/translation.json"],
    en: ["./node_modules/@some-namespace/*/dist/de/translation.json"],
  },
});
```

Configuration options can be imported from other packages using imports:
```js
export default defineConfig({
  localize: {
    // Import an es module:
    ...(await import("my-package/i18n-elements.mjs")).default,
    // or a json file:
    ...(await import("./my-package/i18n-elements.json", { assert: { type: "json" } })),
  },
});
```

## Command Line Interface
```bash
naw-aurelia-i18n [...args]

# Usage examples:
# Specify a different config file:
naw-aurelia-i18n -c ./my-config.mjs
# Run the production workflow once:
naw-aurelia-i18n
# Run the development workflow and watch for changes:
naw-aurelia-i18n -d
# Run the development workflow once:
naw-aurelia-i18n -d --no-watch
```

### `--config <path>, -c <path>`
Specify the configuration file to use.
+ Default is `./i18n-config.mjs`.
+ Supported extensions are `.js, .mjs, .cjs, json`.
+ If the config is a javascript file, it's **default** export is used as configuration options.

### `--dev, -d`
Enable development mode.
+ This actively updates the translation data file and translation IDs in any included sources.
+ This also watches for changes by default.

### `--watch, --no-watch, -w`
Enable or disable watching for changes.
+ Watching is enabled by default in development mode and disabled otherwise.
+ When not watching for changes, the process will exit with a non-zero exit code if any error diagnostics have been raised.

### `--verbose, -v`
Show verbose information like the effective configuration options.
