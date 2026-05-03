'use strict';

/**
 * Injector Module
 *
 * Performs the atomic file rewrite:
 *  1. Read the file
 *  2. Parse all @gen: markers (may be > 1 per file)
 *  3. For each marker (processed in reverse order to keep line indices valid):
 *     a. Call AI to generate code
 *     b. Apply indentation
 *     c. (Optional) Format with Prettier
 *     d. Splice into file content
 *     e. Fix any missing imports
 *  4. Write back atomically (write to temp, then rename)
 *  5. Log timing + success/failure
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const { parseGenMarkers, spliceReplacement } = require('./parser');
const { generateCode } = require('./ai');
const { fixImports } = require('./import-fixer');
const { formatSnippet } = require('./prettier-format');

/**
 * Apply the correct indentation to every line of the generated code.
 *
 * @param {string} code    AI-generated code (may be multi-line)
 * @param {string} indent  The leading whitespace from the marker line
 * @returns {string}
 */
function applyIndent(code, indent) {
  return code
    .split('\n')
    .map((line) => {
      // Don't double-indent lines the AI already indented
      if (line.startsWith(indent)) return line;
      // Don't indent blank lines
      if (line.trim() === '') return line;
      return indent + line;
    })
    .join('\n');
}

/**
 * Write content to a file atomically by writing to a temp file first.
 * Uses the SAME DIRECTORY as the target to avoid cross-device rename errors
 * (critical on Windows when project is on a different drive than %TEMP%).
 *
 * @param {string} filePath
 * @param {string} content
 */
function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  const tmpFile = path.join(dir, `.ghost-tmp-${Date.now()}-${path.basename(filePath)}`);
  fs.writeFileSync(tmpFile, content, 'utf8');
  fs.renameSync(tmpFile, filePath);
}

/**
 * Main injection pipeline for a single file.
 *
 * @param {string}  filePath
 * @param {object}  options
 * @param {number}  options.contextLines
 * @param {boolean} options.usePrettier
 * @param {boolean} options.silent
 * @returns {Promise<void>}
 */
async function injectFile(filePath, options = {}) {
  const { contextLines = 50, usePrettier = true, silent = false } = options;

  const log = (...args) => {
    if (!silent) console.log(...args);
  };
  const err = (...args) => {
    if (!silent) console.error(...args);
  };

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    err(chalk.red(`✗ Cannot read file: ${filePath} — ${e.message}`));
    return;
  }

  const markers = parseGenMarkers(content, contextLines);

  if (markers.length === 0) return; // Nothing to do

  const filename = path.basename(filePath);
  const relPath = path.relative(process.cwd(), filePath);

  log(
    chalk.hex('#6C63FF')(`\n◆ ${relPath}`) +
      chalk.dim(` — ${markers.length} marker(s) found`)
  );

  // Process markers in reverse order so splicing doesn't shift later indices
  const sorted = [...markers].sort((a, b) => b.lineIndex - a.lineIndex);

  for (const marker of sorted) {
    const startMs = Date.now();
    const shortPrompt =
      marker.prompt.length > 60
        ? marker.prompt.slice(0, 57) + '...'
        : marker.prompt;

    log(
      chalk.dim(`  Line ${marker.lineIndex + 1}: `) +
        chalk.yellow(`// @gen: ${shortPrompt}`)
    );
    log(chalk.dim('  ⟳ Generating...'));

    let generated;
    try {
      generated = await generateCode({
        prompt: marker.prompt,
        filename,
        contextAbove: marker.contextAbove,
        contextBelow: marker.contextBelow,
        lineIndex: marker.lineIndex,
        indent: marker.indent,
      });
    } catch (e) {
      err(
        chalk.red(`  ✗ AI error on line ${marker.lineIndex + 1}: ${e.message}`)
      );
      // Restore original marker with error comment so file is not left blank
      const errComment = `${marker.indent}// @gen: ${marker.prompt} [ERROR: ${e.message}]`;
      content = spliceReplacement(content, marker.lineIndex, errComment);
      continue;
    }

    // Apply indentation
    let code = applyIndent(generated, marker.indent);

    // Format with Prettier if enabled
    if (usePrettier) {
      try {
        code = await formatSnippet(code, filePath, marker.indent);
      } catch {
        // Non-fatal — continue with unformatted code
      }
    }

    // Splice into file
    content = spliceReplacement(content, marker.lineIndex, code);

    // Fix missing imports in the updated content
    content = fixImports(content, generated, filename);

    const elapsed = Date.now() - startMs;
    const lineCount = code.split('\n').length;
    log(
      chalk.green(`  ✓ Injected`) +
        chalk.dim(` ${lineCount} line(s) in ${elapsed}ms`)
    );
  }

  // Atomic write
  try {
    atomicWrite(filePath, content);
    log(chalk.dim(`  ↳ Written to disk: ${relPath}\n`));
  } catch (e) {
    err(chalk.red(`  ✗ Write failed: ${e.message}`));
  }
}

module.exports = { injectFile };
