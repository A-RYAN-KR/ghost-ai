'use strict';

/**
 * Parser Module
 *
 * Responsibilities:
 *  - Locate all // @gen: <prompt> markers in a file
 *  - Extract the prompt text
 *  - Capture surrounding context (N lines above + below)
 *  - Capture indentation of the marker line
 */

// Matches @gen: in any common comment style ONLY IF it ends with @@:
//   // @gen: ... @@       (JS, TS, Java, PHP, CSS single-line, Kotlin)
//   <!-- @gen: ... @@ --> (HTML)
//   /* @gen: ... @@ */    (CSS block, Java, JS)
//   # @gen: ... @@        (Python, Bash, YAML, Shell)
const GEN_MARKER_REGEX =
  /^(\s*)(?:\/\/|#|\/\*+|<!--)\s*@gen:\s*(.+?)\s*@@\s*(?:\s*(?:\*\/|-{2}>))?\s*$/;

/**
 * Parse a file and return all gen-marker occurrences.
 *
 * @param {string} content  Full file content as a string
 * @param {number} contextLines  How many lines above/below to include
 * @returns {Array<{
 *   lineIndex: number,
 *   prompt: string,
 *   indent: string,
 *   contextAbove: string[],
 *   contextBelow: string[],
 *   markerLine: string
 * }>}
 */
function parseGenMarkers(content, contextLines = 50) {
  const lines = content.split('\n');
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(GEN_MARKER_REGEX);
    if (!match) continue;

    const indent = match[1];         // leading whitespace
    const prompt = match[2].trim();  // the instruction after @gen:

    const start = Math.max(0, i - contextLines);
    const end = Math.min(lines.length, i + contextLines + 1);

    results.push({
      lineIndex: i,
      prompt,
      indent,
      markerLine: lines[i],
      contextAbove: lines.slice(start, i),
      contextBelow: lines.slice(i + 1, end),
      totalLines: lines.length,
    });
  }

  return results;
}

/**
 * Reconstruct the file with one marker replaced by AI-generated code.
 *
 * @param {string}   content       Original file content
 * @param {number}   lineIndex     Zero-based index of the marker line
 * @param {string}   replacement   Code to inject (already indented)
 * @returns {string} New file content
 */
function spliceReplacement(content, lineIndex, replacement) {
  const lines = content.split('\n');
  lines.splice(lineIndex, 1, ...replacement.split('\n'));
  return lines.join('\n');
}

/**
 * Build a numbered context string for the AI prompt.
 *
 * @param {string[]} above
 * @param {string[]} below
 * @param {number}   markerLine  (1-based for display)
 * @returns {string}
 */
function buildContextBlock(above, below, markerLine) {
  const numbered = (arr, startLine) =>
    arr
      .map((line, i) => `${String(startLine + i).padStart(4, ' ')} | ${line}`)
      .join('\n');

  const aboveStart = markerLine - above.length;
  const belowStart = markerLine + 1;

  return [
    numbered(above, aboveStart),
    `${String(markerLine).padStart(4, ' ')} | <<< REPLACE THIS LINE >>>`,
    numbered(below, belowStart),
  ].join('\n');
}

module.exports = { parseGenMarkers, spliceReplacement, buildContextBlock };
