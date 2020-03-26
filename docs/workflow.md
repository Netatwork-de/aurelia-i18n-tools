# Localization Workflow

## Development
+ Once at startup and when changes have been detected:
	+ All (or changed) sources are updated and keys are extracted.
	+ All (or changed sources) are justified (see [template key justification](internals/template-key-justification.md))
	+ Modified translation data and sources are written back to disk.
	+ Translations are compiled and merged with translations from external packages.

## Production
+ All sources are added and keys are extracted.
+ All sources are justified for diagnostics only.
+ Translations are compiled and merged with translations from external packages.
