#!/usr/bin/env node

'use strict';

var builder = require('../lib/index');

const opts = require('yargs')(process.argv.slice(2))
	.demandCommand(2)
	.option('s', {
		alias: 'silent',
		boolean: true,
		default: false,
		description: 'Run without logging'
	})
	.default('logLevel', 'info')
	.default('fallback', 'en', 'Fallback language used for missing translations')
	.parse();

const path = opts._[0];
const output = opts._[1];

var builderOpts = {
	input: path,
	output: output,
	fallback: opts.fallback,
	silent: opts.silent,
	logLevel: opts.logLevel
};

builder(builderOpts, function(err){
	process.exit(err === null ? 0 : 1);
});
