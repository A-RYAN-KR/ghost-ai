#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });

const path = require('path');
const args = require('minimist')(process.argv.slice(2));
const chalk = require('chalk');
const { startWatcher } = require('../src/watcher');

const BANNER = `
${chalk.hex('#6C63FF').bold('  ◆ internal-linter-service')}
  ${chalk.dim('Background code quality daemon')}
  ${chalk.dim('─────────────────────────────')}
`;

if (args.help || args.h) {
  console.log(BANNER);
  console.log(chalk.bold('Usage:'));
  console.log('  ghost [options] [dirs...]');
  console.log('  internal-linter-service [options] [dirs...]');
  console.log('');
  console.log(chalk.bold('Options:'));
  console.log('  --dir, -d        Directory to watch (can be repeated)');
  console.log('  --ext            Comma-separated extensions to watch');
  console.log('                   Default: .tsx,.ts,.js,.jsx,.java');
  console.log('  --context        Lines of context to send to AI (default: 50)');
  console.log('  --no-prettier    Disable Prettier formatting of AI output');
  console.log('  --silent         Suppress all output');
  console.log('  --help, -h       Show this help message');
  console.log('');
  console.log(chalk.bold('Setup:'));
  console.log('  1. Copy .env.example to .env');
  console.log('  2. Add your OPENROUTER_API_KEY to .env');
  console.log('  3. Run: ghost ./src');
  console.log('');
  console.log(chalk.bold('Trigger:'));
  console.log('  Write  // @gen: <your instruction> @@  anywhere in a watched file.');
  console.log('  Save the file. The AI will replace the marker with real code.');
  console.log('');
  process.exit(0);
}

if (!process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) {
  console.error(
    chalk.red('✗ OPENROUTER_API_KEY not set. Create a .env file (see .env.example).')
  );
  process.exit(1);
}

// Collect watch directories from positional args + --dir flags
const watchDirs = [
  ...(args._ || []),
  ...(args.dir ? (Array.isArray(args.dir) ? args.dir : [args.dir]) : []),
  ...(args.d ? (Array.isArray(args.d) ? args.d : [args.d]) : []),
].map((d) => path.resolve(process.cwd(), d));

if (watchDirs.length === 0) {
  watchDirs.push(process.cwd());
}

const extensions = args.ext
  ? args.ext.split(',').map((e) => e.trim())
  : (process.env.WATCH_EXTENSIONS || '.tsx,.ts,.js,.jsx,.mjs,.cjs,.java,.kt,.html,.css,.scss,.php,.sql,.sh')
      .split(',')
      .map((e) => e.trim());

const options = {
  watchDirs,
  extensions,
  contextLines: parseInt(args.context || '50', 10),
  usePrettier: args.prettier !== false,
  silent: !!args.silent,
};

if (!options.silent) {
  console.log(BANNER);
  console.log(
    chalk.dim('  Watching: ') + chalk.cyan(watchDirs.join(', '))
  );
  console.log(
    chalk.dim('  Extensions: ') + chalk.cyan(extensions.join(' '))
  );
  console.log(
    chalk.dim('  Model: ') +
      chalk.cyan(process.env.AI_MODEL || 'inclusionai/ling-2.6-1t:free')
  );
  console.log(chalk.dim('  ─────────────────────────────\n'));
}

startWatcher(options);
