# l10n-language-builder

[![NPM version][npm-image]][npm-url]

Command line utility for building internationalized JSON-based language files
across multiple regions.

## Installation

Install from NPM:

```shell
npm install l10n-language-builder
```

## How It Works

Now that your application has hit it big, you'd like to translate it into
multiple languages. JSON seems like a good format to use since it's easy to
traverse in JavaScript and has good support for nesting and grouping related
terms together using objects. Also, [Format.js](http://formatjs.io/) and
[i18next](http://i18next.com/) are pretty cool, as is the [ICU Message Syntax](http://userguide.icu-project.org/formatparse/messages).

### Base Language Files

You'll start with your base language files. These should be named using the two
character [primary language subtag (ISO 639-1)](http://en.wikipedia.org/wiki/List_of_ISO_639-1_codes). For example:
en.json (English), es.json (Spanish), fr.json (French).

Sample English (en.json):
```json
{
	"Intro": "Welcome to harbor center",
	"Opening": "It's where ships seek shelter from stormy weather"
}
```

Any English speakers using your application from outside the United States will
quickly point out that "center" is spelled "centre" and "harbor" is actually
"harbour". To solve this, we need some regional overrides...

### Regional Language Files

For each language, there might be zero or more regional overrides to handle
region-specific changes. These files should be prefixed with the
language subtag of the base language, followed by a hyphen, followed by a
two character [regional subtag](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements).
For example: en-CA.json (Canadian English), en-GB.json (United Kingdom English),
en-AU.json (Australian English), and so on.

Sample Canadian English (en-CA.json):
```json
{
	"Intro": "Welcome to harbour centre"
}
```

These region-specific files _only_ need to override the terms that differ from
the base language. They can also be empty.

### Putting it all together

When you point `l10n-language-builder` at a directory containing your base
and regional language files, it will produce a set of files that contains the
union of each base file with each regional override file. This is most useful
as a step in your application's build process.

Other features:
* If your translations for some languages aren't ready yet, you can provide a
default language as a fallback
* If a region file exists (e.g. fr-CA.json) but there's no base file
(e.g. fr.json), an error occurs
* If a region file overrides a term that does not exist in the base file, an
error occurs
* If the data type in a region file differs from that in the base file, an
error occurs

## Usage from the command line

```shell
l10n-language-builder <path> <output> --fallback=fr
```

Where:
* path: directory containing base and region language files
* output: directory to place output files
* fallback: language to use when translations are missing

## Programmatic usage

You can also use `l10n-language-builder` from your JavaScript application:

```javascript
var langBuilder = require('l10n-language-builder');

var opts = {
	input: 'inputDir',
	output: 'outputDir',
	fallback: 'fr' // defaults to "en"
};
langBuilder(opts, function(err) {
	// callback when processing is complete
});
```

## Contributing
Contributions are welcome, please submit a pull request!

### Code Style

This repository is configured with [EditorConfig](http://editorconfig.org) rules and
contributions should make use of them.

[npm-url]: https://www.npmjs.org/package/l10n-language-builder
[npm-image]: https://img.shields.io/npm/v/l10n-language-builder.svg
