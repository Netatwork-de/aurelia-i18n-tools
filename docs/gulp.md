# Gulp Plugin

> **Gulp support is deprecated** and is no longer available in version 4 and later. Use the command line interface instead.

## Installation
```shell
npm i -D gulp @netatwork/aurelia-i18n-tools@3
```

## `createGulpI18n()`
Create a plugin instance.<br>
When watching for changes, this instance caches results.
```js
import { createGulpI18n } from "@netatwork/aurelia-i18n-tools";

const i18n = createGulpI18n();
```

## `i18n(..)`
Run the [localization workflow](workflow.md) task.
```js
function localize(development, since) {
    return i18n({
        config,
        development,
        aureliaTemplateFiles: gulp.src("src/**/*.html", { since }),
        jsonResourceFiles: gulp.src("src/**/*.r.json", { since }),

        translationDataPath: "i18n.json",
        localeFilename: "[id].json",

        writeSources: () => gulp.dest("src/"),
        writeLocales: () => gulp.dest("dist/locales"),

        externalLocales: () => ({
            en: gulp.src("node_modules/some-localized-dependency/dist/en.json"),
            de: gulp.src("node_modules/some-localized-dependency/dist/de.json")
        })
    });
}

gulp.task("build-i18n", function build() {
    // Run in production mode:
    return localize(false);
});

function watch() {
    // Run in development mode and ignore unchanged sources:
    return localize(true, gulp.lastRun(watch));
}

gulp.task("watch-i18n", gulp.series(watch, () => gulp.watch("src/**/*", watch)));
```
+ config `<Config>` - The [project config](config.md) instance. (This option must be the same for every run)
+ development `<boolean>` - If true, the development workflow is used. (This option must be the same for every run)
    + Note that the task will throw an error if any error occurs in production.
+ enforcePrefix `<boolean>` - If true, keys not starting with the correct prefix are replaced. Default is `false`
+ aureliaTemplateFiles `<Readable>` - A stream of aurelia template files.
+ jsonResourceFiles `<Readable>` - A stream of json resource files.
+ translationDataPath `<string>` - The project's translation data path. Default is `"i18n.json"`
+ localeFilename `<string>` - The filename template that is used to write compiled locales. Default is `"[id].json"`
+ writeSources `<() => Writable>` - Create a stream for writing modified sources.
+ writeLocales `<() => Writable>` - Create a stream for writing compiled locales.
+ externalLocales `<() => Record<string, Readable>>` - Optional. Create an object with streams to read precompiled locale files from external packages.
    + Note that including external locales with globs like `"node_modules/*/dist/en.json"` is a potential security risk.
