'use strict';

/**
 * Watcher Module
 *
 * Uses chokidar to monitor file changes. On a save event:
 *  1. Debounce rapid successive saves (e.g. auto-save)
 *  2. Quick-scan file for @gen: marker before doing anything expensive
 *  3. Delegate to the injector pipeline
 */

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const chokidar = require('chokidar');
const { injectFile } = require('./injector');

/** Files currently being processed — prevent re-entrant triggers */
const inFlight = new Set();

/** Per-file debounce timers */
const debounceTimers = new Map();
const DEBOUNCE_MS = 300;

/**
 * Quick check: does the file contain a @gen: marker?
 * Avoids spinning up the full pipeline on every save.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function hasGenMarker(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // @gen: is the start, @@ is the end
    return content.includes('@gen:') && content.includes('@@');
  } catch {
    return false;
  }
}

/**
 * Build the glob pattern for chokidar based on extensions.
 *
 * @param {string[]} dirs
 * @param {string[]} extensions
 * @returns {string[]}
 */
function buildGlobs(dirs, extensions) {
  return dirs.flatMap((dir) => {
    // Normalize to forward slashes for chokidar
    const normalized = dir.replace(/\\/g, '/');
    return extensions.map((ext) => `${normalized}/**/*${ext}`);
  });
}

/**
 * Start the file watcher.
 *
 * @param {object} options
 * @param {string[]} options.watchDirs
 * @param {string[]} options.extensions
 * @param {number}   options.contextLines
 * @param {boolean}  options.usePrettier
 * @param {boolean}  options.silent
 */
function startWatcher(options) {
  const {
    watchDirs,
    extensions,
    contextLines,
    usePrettier,
    silent,
  } = options;

  const globs = buildGlobs(watchDirs, extensions);

  const watcher = chokidar.watch(globs, {
    // Don't fire on initial scan — only on actual changes
    ignoreInitial: true,
    // Use polling only on network drives; native events on local FS
    usePolling: false,
    // Ignore hidden dirs, node_modules, build output
    ignored: [
      /(^|[/\\])\../, // dotfiles/folders
      /node_modules/,
      /dist[/\\]/,
      /build[/\\]/,
      /\.next[/\\]/,
      /\.cache[/\\]/,
      /coverage[/\\]/,
      /out[/\\]/,
    ],
    awaitWriteFinish: {
      // Wait for the file to stop growing before firing
      stabilityThreshold: 80,
      pollInterval: 50,
    },
  });

  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  watcher.on('ready', () => {
    log(chalk.green('  ✓ Watcher active') + chalk.dim(' — waiting for saves...'));
  });

  watcher.on('change', (filePath) => {
    const absPath = path.resolve(filePath);

    // Debounce: reset timer if file changes rapidly
    if (debounceTimers.has(absPath)) {
      clearTimeout(debounceTimers.get(absPath));
    }

    const timer = setTimeout(async () => {
      debounceTimers.delete(absPath);

      // Skip if already processing this file
      if (inFlight.has(absPath)) {
        log(chalk.dim(`  ⊘ Skipped (in flight): ${path.relative(process.cwd(), absPath)}`));
        return;
      }

      // Quick pre-check before expensive pipeline
      if (!hasGenMarker(absPath)) return;

      inFlight.add(absPath);
      try {
        await injectFile(absPath, { contextLines, usePrettier, silent });
      } finally {
        inFlight.delete(absPath);
      }
    }, DEBOUNCE_MS);

    debounceTimers.set(absPath, timer);
  });

  watcher.on('error', (error) => {
    console.error(chalk.red(`  ✗ Watcher error: ${error.message}`));
  });

  // Graceful shutdown
  process.on('SIGINT', () => shutdown(watcher, silent));
  process.on('SIGTERM', () => shutdown(watcher, silent));
}

function shutdown(watcher, silent) {
  if (!silent) {
    console.log(chalk.dim('\n  ◆ Shutting down watcher...'));
  }
  watcher.close().then(() => process.exit(0));
}

module.exports = { startWatcher };
