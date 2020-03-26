# Json Translation Data
In every localized project, an `i18n.json` file is used to store all translations.
This file can then be modified by external tools to localize an application.

## Schema
The following schema represents the data in an `i18n.json` file.
```js
{
	// The filename of the localized source relative to the directory of
	// the i18n.json file. Backslashes must be replaced with forward slashes.
	"<filename>": {
		// Every source entry contains an object with translations:
		"content": {
			// The absolute i18n key:
			"<key>": {
				// The default english translation that is extracted from the source code:
				"content": "<english content>",
				// The last modified date of the english translation in the source as an iso string:
				"lastModified": "<last modified>",
				// An array of string parts that can be ignored by external spell checkers:
				"ignoreSpelling": [],
				// An object with translations for every supported language other than english:
				// - Unsupported or missing translations may be omitted
				"translations": {
					// The locale key like ("de", or "fr"):
					"<locale>": {
						// The translated content:
						"content": "<<locale> content>",
						// The last modified date of this translation:
						"lastModified": "<last modified>",
						// An array of string parts that can be ignored by external spell checkers:
						"ignoreSpelling": []
					}
				}
			}
		}
	}
}
```

Type definitions for the above schema are exported as `TranslationData.Json`
```ts
import { TranslationData } from "@netatwork/aurelia-i18n-tools";
```

## Formatting
The `i18n.json` file must be formatted as follows:
+ `\n` **must** be used for new lines.
+ `\t` **must** be used for indentation.
+ The file **must not** end with a trailing new line.
+ Dynamic object keys (`<filename>` `<key>` and `<locale>`) must be sorted lexicographically.
+ All other object keys must be in the order specified by the schema.
