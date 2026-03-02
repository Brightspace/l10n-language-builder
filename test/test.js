'use strict';

const chai = require('chai'),
	chaiAsPromised = require('chai-as-promised').default,
	errors = require('../lib/errors'),
	fs = require('fs-promise'),
	langBuilder = require('../'),
	Q = require('q'),
	sinon = require('sinon'),
	winston = require('winston');

chai.use(chaiAsPromised);
const expect = chai.expect;

function removeDir(dir) {
	return fs.remove(dir);
}

describe('langBuilder', function() {

	beforeEach(function() {
		sinon.stub(winston,'info');
		sinon.stub(winston,'warn');
		sinon.stub(winston,'error');
		sinon.spy(winston,'remove');
	});

	afterEach(function() {
		winston.info.restore();
		winston.warn.restore();
		winston.error.restore();
		winston.remove.restore();
		return Q.all([removeDir('./test/temp'),removeDir('./test/temp2')]);
	});

	describe('find files', function() {

		it('should error when input directory is a file', function() {
			return expect(langBuilder._findFiles('./test/errors/not-a-directory'))
				.to.eventually.be.rejectedWith(errors.invalidInputDirectory());
		});

		it('should error when input directory does not exist', function() {
			return expect(langBuilder._findFiles('./test/does-not-exist'))
				.to.eventually.be.rejectedWith(errors.invalidInputDirectory());
		});

		it('should list files inside the directory', function() {
			return expect(langBuilder._findFiles('./test/sample'))
				.to.eventually.have.length(3);
		});

	});

	describe('read file', function() {

		it('should throw when file has non-JSON extension', function() {
			var filename = 'non-json-extension.badext';
			var promise = langBuilder._readFile(
				'./test/errors',
				filename
			);
			return expect(promise)
				.to.eventually.be.rejectedWith(errors.nonJsonExtension(filename));
		});

		it('should throw when file contains invalid JSON', function() {
			var promise = langBuilder._readFile('./test/errors', 'invalid-json.json');
			return expect(promise).to.eventually.be.rejectedWith('Expected property name or \'}\' in JSON at position 3 (line 2 column 2)');
		});

		it('should use empty object when file is empty', function(done) {
			langBuilder._readFile('./test/errors', 'empty-FILE.json')
				.then(function(file) {
					expect(file).to.not.be.null;
					expect(file.name).to.equal('empty-FILE');
					expect(file.content).to.eql({});
					done();
				}).fail(done);
		});

		it('should return filename and parsed content', function(done) {
			langBuilder._readFile('./test/sample', 'fr-CA.json')
				.then(function(file) {
					expect(file).to.not.be.null;
					expect(file.name).to.equal('fr-CA');
					expect(file.content).to.have.property('B','b-CA');
					done();
				}).fail(done);
		});

	});

	describe('read files', function() {

		it('should read all files in a directory', function() {
			var promise = langBuilder._readFiles(
				'./test/sample',
				['fr.json','fr-CA.json','fr-FR.json']
			);
			return expect(promise).to.eventually.have.length(3);
		});

	});

	describe('extract', function() {

		it('should lowercase language subtag', function() {
			var result = langBuilder._extract(
				[{name:'en'},{name:'EN-CA'}],
				'en'
			);
			expect(result.regions[0]).to.have.property('language','en');
		});

		it('should uppercase region subtag', function() {
			var result = langBuilder._extract(
				[{name:'en'},{name:'en-ca'}],
				'en'
			);
			expect(result.regions[0]).to.have.property('region','CA');
		});

		it('should have reference to file content', function() {
			var result = langBuilder._extract(
				[{name:'en'},{name:'en-CA',content:{A:'b'}}],
				'en'
			);
			expect(result.regions[0].content).to.eql({A:'b'});
		});

		it('should populate languages with base language content', function() {
			var result = langBuilder._extract(
				[{name:'en',content:1},{name:'fr',content:2},{name:'es',content:3}],
				'en'
			);
			expect(result.languages).to.have.property('en',1);
			expect(result.languages).to.have.property('fr',2);
			expect(result.languages).to.have.property('es',3);
		});

		it('should populate regions', function() {
			var result = langBuilder._extract(
				[{name:'en'},{name:'en-CA',content:1},{name:'en-GB',content:2}],
				'en'
			);
			expect(result.regions).to.have.length(2);
			expect(result.regions[0]).to.have.property('language','en');
			expect(result.regions[0]).to.have.property('region','CA');
			expect(result.regions[0]).to.have.property('content',1);
			expect(result.regions[1]).to.have.property('language','en');
			expect(result.regions[1]).to.have.property('region','GB');
			expect(result.regions[1]).to.have.property('content',2);
		});

		it('should throw if fallback language is missing', function() {
			var expectedError = errors.missingFallback('en');
			expect(function() {
				langBuilder._extract([{name:'en-CA'}], 'en');
			}).to.throw(expectedError);
		});

	});

	describe('mergeLang', function() {

		it('should throw if key not present in fallback language', function() {
			var expectedError = errors.missingBaseLanguageKey('A', 'en', 'fr');
			expect(function() {
				langBuilder._mergeLang({}, {A:'b'}, 'en', 'fr', '');
			}).to.throw(expectedError);
		});

		it('should warn if key not present in base language', function() {
			var expectedWarning = errors.missingOverrideLanguageKey('A','es','de');
			var fallback = {A: 'a'};
			var language = {};
			langBuilder._mergeLang({A:'a'},{},'es','de','');
			expect(winston.warn.calledOnce).to.be.true;
			expect(winston.warn.getCall(0).args[0]).to.equal(expectedWarning);
			expect(fallback).to.have.property('A','a');
		});

		it('should throw if data type mismatch', function() {
			var expectedError = errors.typeMismatch('A', 'it', 'pt');
			expect(function() {
				langBuilder._mergeLang({A:'b'}, {A:{}}, 'it', 'pt', '');
			}).to.throw(expectedError);
		});

		it('should throw if value is not a string or object', function() {
			var expectedError = errors.invalidDataType('A', 'en');
			expect(function() {
				langBuilder._mergeLang({A:1}, {A:2}, 'en', 'US', '');
			}).to.throw(expectedError);
		});

		it('should override fallback with base language', function() {
			var fallback = {A:'a'};
			var language = {A:'a-override'};
			langBuilder._mergeLang(fallback, language, 'gr', 'tu', '');
			expect(fallback).to.have.property('A', 'a-override');
		});

		it('should override nested values', function() {
			var fallback = {A:{AA:'aa'}};
			var language = {A:{AA:'aa-override'}};
			langBuilder._mergeLang(fallback, language, 'qe', 'ct', '');
			expect(fallback).to.eql({A:{AA:'aa-override'}});
		});

		it('should not override with empty objects', function() {
			var fallback = {A:{AA:'aa'}};
			var language = {A:{}};
			langBuilder._mergeLang(fallback, language, 'na', 'ma', '');
			expect(fallback).to.eql({A:{AA:'aa'}});
		});

	});

	describe('mergeRegion', function() {

		it('should throw if key not present in base language', function() {
			var expectedError = errors.missingBaseLanguageKey('A', 'en', 'US');
			expect(function() {
				langBuilder._mergeRegion({}, {A:'b'}, 'en', 'US', '');
			}).to.throw(expectedError);
		});

		it('should throw if data type mismatch', function() {
			var expectedError = errors.typeMismatch('A', 'en', 'US');
			expect(function() {
				langBuilder._mergeRegion({A:'b'}, {A:{}}, 'en', 'US', '');
			}).to.throw(expectedError);
		});

		it('should throw if value is not a string or object', function() {
			var expectedError = errors.invalidDataType('A', 'en');
			expect(function() {
				langBuilder._mergeRegion({A:1}, {A:2}, 'en', 'US', '');
			}).to.throw(expectedError);
		});

		it('should keep base language if no region override', function() {
			var base = {A:'a'};
			var region = {};
			langBuilder._mergeRegion(base, region, 'en', 'US', '');
			expect(base).to.have.property('A', 'a');
		});

		it('should override base language with region', function() {
			var base = {A:'a'};
			var region = {A:'a-override'};
			langBuilder._mergeRegion(base, region, 'en', 'US', '');
			expect(base).to.have.property('A', 'a-override');
		});

		it('should override nested values', function() {
			var base = {A:'a',B:{BA:'ba',BB:'bb'}};
			var region = {B:{BB:'bb-override'}};
			langBuilder._mergeRegion(base, region, 'en', 'US', '');
			expect(base).to.eql({A:'a',B:{BA:'ba',BB:'bb-override'}});
		});

		it('should not override with empty objects', function() {
			var base = {A:'a',B:{BA:'ba',BB:'bb'}};
			var region = {B:{}};
			langBuilder._mergeRegion(base, region, 'en', 'US', '');
			expect(base).to.eql({A:'a',B:{BA:'ba',BB:'bb'}});
		});

	});

	describe('combine', function() {

		it('should throw if base language is missing', function() {
			var input = {
				languages: {en:{}},
				regions: [
					{language:'fr',region:'CA'}
				]
			};
			var expectedError = errors.missingBaseLanguage('fr', 'CA');
			expect(function() {
				langBuilder._combine(input,'en');
			}).to.throw(expectedError);
		});

		it('should combine region with base language', function() {
			var input = {
				languages: {
					fr: require('./sample/fr.json')
				},
				regions: [
					{
						language: 'fr',
						region: 'CA',
						content: require('./sample/fr-CA.json')
					},
					{
						language: 'fr',
						region: 'FR',
						content: require('./sample/fr-FR.json')
					}
				]
			};
			var expectedResult = {
				languages: {
					fr: require('./output/fr.json')
				},
				regions: [
					{
						language: 'fr',
						region: 'CA',
						content: require('./output/fr-CA.json')
					},
					{
						language: 'fr',
						region: 'FR',
						content: require('./output/fr-FR.json')
					}
				]
			};
			expect(langBuilder._combine(input, 'fr')).to.eql(expectedResult);
		});

	});

	describe('writeFiles', function() {

		beforeEach(function() {
			return fs.mkdirs('./test/temp')
				.then(function() {
					return fs.writeFile('./test/temp/file.json','stuff');
				});
		});

		it('should throw if output not a directory', function() {
			return expect(langBuilder._writeFiles('./test/errors/not-a-directory'))
				.to.eventually.be.rejectedWith(errors.invalidOutputDirectory());
		});

		it('should empty directory if it exists', function(done) {
			langBuilder._writeFiles('./test/temp',{languages:{},regions:[]})
				.then(function() {
					return fs.readdir('./test/temp');
				}).then(function(files) {
					expect(files).to.have.length(0);
					done();
				}).fail(done);
		});

		it('should create directory if it not does exist', function(done) {
			langBuilder._writeFiles('./test/temp2',{languages:{},regions:[]})
				.then(function() {
					return fs.stat('./test/temp2');
				}).then(function(stat) {
					expect(stat.isDirectory()).to.be.true;
					done();
				}).fail(done);
		});

		it('should write a region to a file', function(done) {
			var input = {
				languages: {},
				regions: [
					{
						language: 'en',
						region: 'AU',
						content: {A:'a'}
					}
				]
			};
			langBuilder._writeFiles('./test/temp',input)
				.then(function() {
					return fs.readFile('./test/temp/en-AU.json');
				}).then(function(content) {
					content = JSON.parse(content);
					expect(content).to.have.property('A','a');
					done();
				}).fail(done);
		});

		it('should write a language to a file', function(done) {
			var input = {
				languages: {
					it: { A: 'a' }
				},
				regions: []
			};
			langBuilder._writeFiles('./test/temp',input)
				.then(function() {
					return fs.readFile('./test/temp/it.json');
				}).then(function(content) {
					content = JSON.parse(content);
					expect(content).to.have.property('A','a');
					done();
				}).fail(done);
		});

	});

	describe('builder', function() {

		it('should pipe result to the callback', function(done) {
			var opts = {
				input: './test/sample',
				output: './test/temp',
				fallback: 'fr'
			};
			langBuilder(opts, function(err) {
				expect(err).to.be.null;
				done();
			});
		});

		it('should pipe errors to the callback', function(done) {
			langBuilder(null, function(err) {
				expect(err).to.not.be.null;
				done();
			});
		});

		it('should silence winston with silent option', function(done) {
			var opts = {
				input: './test/sample',
				output: './test/temp',
				silent: true
			};
			langBuilder(opts,function(err){
				expect(winston.remove.calledOnce).to.be.true;
				done();
			});
		});

		it('should pass logLevel on to winston', function(done) {
			var opts = {
				input: './test/sample',
				output: './test/temp',
				logLevel: 'foo'
			};
			langBuilder(opts,function(err){
				expect(winston.level).to.equal('foo');
				done();
			});
		});

		it('should write the packaged files to disk', function(done) {
			var opts = {
				input: './test/sample',
				output: './test/temp',
				fallback: 'fr'
			};
			langBuilder(opts, function(err) {
				expect(err).to.be.null;

				['fr.json', 'fr-CA.json', 'fr-FR.json'].forEach(function(langFile) {
					expect(require('./temp/' + langFile))
						.to.deep.equal(require('./output/' + langFile));
				});

				done();
			});
		});
	});

});
