# Configuration
The following function can be used to create a configuration instance.
```ts
import { createConfig } from "@netatwork/aurelia-i18n-tools";

const config = createConfig(context, options);
```
+ context `<string>` - The project root directory. Relative paths are resolved using this directory.
+ options `<object>` - Optional. An object with the following optional properties:
    + src `<string>` - The root of the source directory. Default is `"src"`
    + prefix `<string>` - A prefix that should be used for all keys in this project.
        + This excludes translations from external packages.
        + Default is `""`
    + sourceLocale `<string>` - The locale used in source files. Default is `"en"`.
    + ignore `<IgnoreRuleObject[]>` - An array of ignore rule objects:
        + element `<IgnoreRule>` - Optional. Ignore elements and their subtrees by tag name.
        + textContent `<IgnoreRule>` - Optional. Ignore the existance of text content.
        + attributeValue `<IgnoreRule>` - Optional. Ignore the existance of attributes by value.
        + Text content and attribute values that include interpolation are always ignored.
        + An `IgnoreRule` can be one of the following:
            + `<string>` - A case sensitive regular expression.
            + `<RegExp>` - A regular expression instance.
            + `<function>` - A function that takes a string value and returns a boolean.
    + localize `<object>` - An object with tag names as properties to specify elements that can be localized:
        + content `<string>` - Specify how element content is localized:
            + `"none"` - Default. Element content is not localized.
            + `"text"` - Content is localized as text.
            + `"html"` - Content is localized as html.
        + attributes `<string[]>` - An array of attribute names that can be localized.
        + `"*"` can be used as property to match all elements.
    + whitespace `<object>` - An object with tag names as properties to specify how whitespace is handled for specific elements.
        + `<WhitespaceHandling>` - Set whitespace handling for both attributes and content.
        + attributes `<object>` - An object with attribute names as properties and `<WhitespaceHandling>` as value to set how whitespace is handled for specific attributes.
            + `"*"` can be used as property to match all attributes.
        + content `<WhitespaceHandling>` - Set whitespace handling for content.
        + `"*"` can be used as property to match all elements.
        + `WhitespaceHandling` can be one of the following values:
            + `"preserve"` - Extract whitespace as is (default).
            + `"trim"` - Trim leading and trailing whitespace.
            + `"collapse"` - Collapse leading, trailing and whitespace in between text to a single space.
            + `"trim-collapse"` - Trim leading and trailing whitespace and collapse whitespace in between text to a single space.
    + diagnostics `<object>` - An object to specify how diagnostics should handled.
        + all `<HandlingType>` - A fallback value for unconfigured types. Default is `"warn"`.
        + *[Diagnostic.Type]* `<HandlingType>` - Specify how specific diagnostics are handled.
        + `HandlingType` can be `"error"`, `"warn"` or `"ignore"`.

An example configuration could look like this:
```ts
import { createConfig, ElementContentLocalizationType, Diagnostic, Config } from "@netatwork/aurelia-i18n-tools";

createConfig(__dirname, {
    src: "src",
    prefix: "app.",
    sourceLocale: "en",
    localize: {
        "*": {
            attributes: ["title"]
        },
        h1: {
            content: ElementContentLocalizationType.Text
        },
        img: {
            attributes: ["alt"]
        }
    },
    whitespace: {
        "*": "trim",
        pre: {
            attributes?: "trim",
            content: "preserve"
        }
    },
    diagnostics: {
        all: Config.DiagnosticHandling.Error,
        [Diagnostic.Type.MixedContent]: Config.DiagnosticHandling.Ignore
    }
});
```
