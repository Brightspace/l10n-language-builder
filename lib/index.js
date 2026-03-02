'use strict';

var errors = require('./errors'),
	fs = require('fs/promises'),
	path = require('path'),
	winston = require('winston');

winston.cli();

function findFiles(dirPath) {
	return fs.stat(dirPath)
		.catch(function(err) {
			winston.debug(err);
			throw new Error(errors.invalidInputDirectory());
		})
		.then(function(stat) {
			if(!stat.isDirectory()) {
				throw new Error(errors.invalidInputDirectory());
			}
		})
		.then(function() {
			return fs.readdir(dirPath);
		});
}

function readFiles(dirPath, filenames) {

	winston.info('Searching for language input files...');

	var promises = [];

	filenames.forEach(function(filePath) {
		promises.push(readFile(dirPath, filePath));
	});

	return Promise.all(promises);

}

function readFile(dirPath, filePath) {

	var ext = path.extname(filePath);
	var filename = path.basename(filePath);
	var name = path.basename(filePath, ext);

	if(ext !== '.json') {
		return Promise.reject(new Error(errors.nonJsonExtension(filename)));
	}

	var fullPath = path.join(dirPath, filePath);
	return fs.readFile(fullPath, 'utf8')
		.then(function(content) {
			var parsedContent = {};
			content = content.trim();
			if(content.length > 0) {
				try {
					parsedContent = JSON.parse(content);
				} catch(e) {
					winston.info('Syntax error parsing JSON in "%s"', filename);
					throw e;
				}
			}
			return {
				name: name,
				content: parsedContent
			};
		});

}

function extract(files, fallback) {

	var languages = [];
	var regions = [];

	var langStr = '';
	var langComma = '';
	var regionStr = '';
	var regionComma = '';

	files.forEach(function(file) {
		var subtags = file.name.split('-');
		var langSubtag = subtags[0].toLowerCase();
		if(subtags.length === 1) {
			langStr += langComma + langSubtag;
			langComma = ', ';
			languages[langSubtag] = file.content || {};
		} else {
			var regionSubtag = subtags[1].toUpperCase();
			regionStr += regionComma + langSubtag + '-' + regionSubtag;
			regionComma = ', ';
			regions.push({
				language: langSubtag,
				region: regionSubtag,
				content: file.content
			});
		}
	});

	if(languages[fallback] === undefined) {
		throw new Error(errors.missingFallback(fallback));
	}

	winston.info('\tBase languages: ' + langStr);
	winston.info('\tRegion overrides: ' + regionStr);

	return {
		languages: languages,
		regions: regions
	};

}

function incrementKey(objPath, propName) {
	var key = objPath;
	if(objPath.length > 0) {
		key += '.';
	}
	key += propName;
	return key;
}

function mergeRegion(obj1, obj2, language, region, objPath) {
	for(var p in obj2) {

		var key = incrementKey(objPath, p);

		if(typeof obj1[p] === 'undefined') {
			throw new Error(
				errors.missingBaseLanguageKey(key, language, region)
			);
		}
		if(typeof obj1[p] !== typeof obj2[p]) {
			throw new Error(
				errors.typeMismatch(key, language, region)
			);
		}
		if(typeof obj1[p] === 'string') {
			obj1[p] = obj2[p];
		} else if( typeof obj1[p] === 'object') {
			mergeRegion(obj1[p], obj2[p], language, region, key);
		} else {
			throw new Error(
				errors.invalidDataType(key, language)
			);
		}
	}
}

function mergeLang(obj1, obj2, fallback, language, objPath) {

	for(var p2 in obj2) {
		var key2 = incrementKey(objPath, p2);
		if(typeof obj1[p2] === 'undefined') {
			throw new Error(
				errors.missingBaseLanguageKey(key2,fallback,language)
			);
		}
	}

	for(var p in obj1) {

		var key = incrementKey(objPath, p);

		if(typeof obj2[p] === 'undefined') {
			winston.warn(
				errors.missingOverrideLanguageKey(
					key,
					fallback,
					language
				)
			);
			continue;
		}

		if(typeof obj1[p] !== typeof obj2[p]) {
			throw new Error(
				errors.typeMismatch(key, fallback, language)
			);
		}
		if(typeof obj1[p] === 'string') {
			obj1[p] = obj2[p];
		} else if( typeof obj1[p] === 'object') {
			mergeLang(obj1[p], obj2[p], fallback, language, key);
		} else {
			throw new Error(
				errors.invalidDataType(key, fallback)
			);
		}
	}

}

function combine(input, fallback) {

	winston.info('Merging base languages with fallback [%s]...', fallback);

	for(var lang in input.languages) {
		var newObj = JSON.parse(JSON.stringify(input.languages[fallback]));
		mergeLang(newObj, input.languages[lang], fallback, lang, '');
		input.languages[lang] = newObj;
	}

	winston.info('Merging region overrides with base languages...');

	input.regions.forEach(function(region) {

		var lang = input.languages[region.language];
		if(!lang) {
			throw new Error(
				errors.missingBaseLanguage(region.language,region.region)
			);
		}

		var newObj = JSON.parse(JSON.stringify(lang));
		mergeRegion(newObj, region.content, region.language, region.region, '');
		region.content = newObj;

		winston.info(
			'\t%s-%s merged with %s',
			region.language,
			region.region,
			region.language
		);

	});

	return input;

}

function writeFiles(output, input) {
	return fs
		.stat(output)
		.catch(function(err) {
			// catches errors such as doesnt exist, which we dont care about
			winston.debug(err);
		})
		.then(function(stat) {
			if (stat && stat.isFile()) {
				throw new Error(errors.invalidOutputDirectory());
			}

			return fs.rm(output, { recursive: true, force: true });
		}).then(function() {
			return fs.mkdir(output, { recursive: true });
		}).then(function() {

			winston.info('Writing to output directory...');

			var promises = [];

			for(var lang in input.languages) {
				promises.push(
					writeFile(
						output,
						lang,
						input.languages[lang]
					)
				);
			}

			input.regions.forEach(function(region) {
				promises.push(
					writeFile(
						output,
						region.language + '-' + region.region,
						region.content
					)
				);
			});

			return Promise.all(promises);

		});

}

function writeFile(output, filename, content) {

 	filename = filename + '.json';
	var p = path.join(output, filename);
	var strContent = JSON.stringify(content, null, '\t');

	winston.info('\t%s', filename);
	return fs.writeFile(p, strContent);

}

module.exports = function(options, cb) {

	options = options || {};
	options.fallback = options.fallback ? options.fallback.toLowerCase() : 'en';
	options.silent = options.silent !== true ? false : true;

	if(options.silent) {
		winston.remove(winston.transports.Console);
	}
	if(options.logLevel) {
		winston.level = options.logLevel;
	}

	findFiles(options.input)
		.then(function(filenames) {
			return readFiles(options.input, filenames);
		})
		.then(function(files) {
			return extract(files, options.fallback);
		}).then(function(input) {
			return combine(input, options.fallback);
		}).then(function(input) {
			return writeFiles(options.output, input);
		})
		.then(function() {
			winston.info('Done!');
			cb(null);
		}).catch(function(err) {
			winston.error(err.message);
			cb(err);
		});

};
module.exports._combine = combine;
module.exports._extract = extract;
module.exports._findFiles = findFiles;
module.exports._mergeRegion = mergeRegion;
module.exports._mergeLang = mergeLang;
module.exports._readFiles = readFiles;
module.exports._readFile = readFile;
module.exports._writeFiles = writeFiles;
module.exports._writeFile = writeFile;
