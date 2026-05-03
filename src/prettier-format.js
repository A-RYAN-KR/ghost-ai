'use strict';

/**
 * Prettier Format Module
 *
 * Runs AI-generated code (and optionally the whole file) through Prettier
 * to enforce consistent formatting before injecting into the file.
 */

let prettier = null;
let prettierLoaded = false;

async function loadPrettier() {
  if (prettierLoaded) return prettier;
  try {
    prettier = await import('prettier');
    prettierLoaded = true;
  } catch {
    prettier = null;
    prettierLoaded = true;
  }
  return prettier;
}

/**
 * Detect parser based on file extension.
 * @param {string} filename
 * @returns {string}
 */
function detectParser(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const parserMap = {
    // JavaScript ecosystem
    tsx: 'babel',
    ts: 'typescript',
    jsx: 'babel',
    js: 'babel',
    mjs: 'babel',
    cjs: 'babel',
    // Web
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    // Data / config
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    // Java (prettier-plugin-java optional — falls back gracefully)
    java: 'java',
    // PHP (prettier-plugin-php optional — falls back gracefully)
    php: 'php',
  };
  return parserMap[ext] || 'babel';
}

/**
 * Try to find a Prettier config in the project directory.
 * Falls back to opinionated defaults if none found.
 *
 * @param {string} filePath  Absolute path to the file being processed
 * @returns {Promise<object>} Prettier options
 */
async function getPrettierConfig(filePath, p) {
  try {
    const config = await p.resolveConfig(filePath);
    if (config) return config;
  } catch {
    // ignore
  }

  // Sensible defaults that match most modern projects
  return {
    semi: true,
    singleQuote: true,
    trailingComma: 'es5',
    tabWidth: 2,
    printWidth: 100,
  };
}

/**
 * Format a complete file with Prettier.
 * Safe: returns original content on any error.
 *
 * @param {string} content   Full file content
 * @param {string} filePath  Absolute path (used for config resolution)
 * @returns {Promise<string>}
 */
async function formatFile(content, filePath) {
  const p = await loadPrettier();
  if (!p) return content;

  const parser = detectParser(filePath);
  const config = await getPrettierConfig(filePath, p);

  try {
    const formatted = await p.format(content, { ...config, parser });
    return formatted;
  } catch {
    // Formatting failed — return unchanged
    return content;
  }
}

/**
 * Format only a snippet (generated code) by wrapping it in a dummy file.
 * This is faster than formatting the entire file.
 *
 * @param {string} snippet   The AI-generated code
 * @param {string} filePath  Used to detect parser and config
 * @param {string} indent    Leading whitespace (preserved after format)
 * @returns {Promise<string>}
 */
async function formatSnippet(snippet, filePath, indent = '') {
  const p = await loadPrettier();
  if (!p) return snippet;

  const parser = detectParser(filePath);
  const config = await getPrettierConfig(filePath, p);

  try {
    // Remove indent before formatting, re-apply after
    const stripped = snippet
      .split('\n')
      .map((line) =>
        line.startsWith(indent) ? line.slice(indent.length) : line
      )
      .join('\n');

    const formatted = await p.format(stripped, { ...config, parser });

    // Re-apply indentation
    return formatted
      .split('\n')
      .map((line) => (line.trim() ? indent + line : line))
      .join('\n')
      .trimEnd();
  } catch {
    return snippet;
  }
}

module.exports = { formatFile, formatSnippet };
