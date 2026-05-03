'use strict';

/**
 * Import Fixer Module
 *
 * Analyzes AI-generated code for identifiers that require imports,
 * compares against already-present import statements in the file,
 * and silently injects any missing import lines at the top of the file.
 *
 * Currently handles:
 *  - React hooks (useState, useEffect, useRef, useCallback, useMemo, useReducer, useContext, useLayoutEffect, useTransition, useDeferredValue, useId, useInsertionEffect, useSyncExternalStore)
 *  - React types (FC, ReactNode, ReactElement, CSSProperties, MouseEvent, ChangeEvent, FormEvent, KeyboardEvent, RefObject, MutableRefObject)
 *  - Common React Native hooks
 *  - Custom heuristic: any capitalized identifier used but not imported
 */

// Map of identifier → the import statement that provides it
const REACT_HOOKS = [
  'useState',
  'useEffect',
  'useRef',
  'useCallback',
  'useMemo',
  'useReducer',
  'useContext',
  'useLayoutEffect',
  'useTransition',
  'useDeferredValue',
  'useId',
  'useInsertionEffect',
  'useSyncExternalStore',
  'useImperativeHandle',
  'useDebugValue',
  'forwardRef',
  'createContext',
  'memo',
  'lazy',
  'Suspense',
  'Fragment',
  'StrictMode',
  'createRef',
  'createElement',
  'cloneElement',
  'isValidElement',
  'Children',
];

const REACT_TYPES = [
  'FC',
  'FunctionComponent',
  'ReactNode',
  'ReactElement',
  'CSSProperties',
  'MouseEvent',
  'ChangeEvent',
  'FormEvent',
  'KeyboardEvent',
  'RefObject',
  'MutableRefObject',
  'Dispatch',
  'SetStateAction',
  'ComponentProps',
  'ComponentPropsWithRef',
  'HTMLAttributes',
  'ButtonHTMLAttributes',
  'InputHTMLAttributes',
  'TextareaHTMLAttributes',
  'SelectHTMLAttributes',
  'AnchorHTMLAttributes',
  'ImgHTMLAttributes',
  'SVGProps',
];

/**
 * Check if a specific named export is already imported from a given source.
 *
 * @param {string} content  Full file content
 * @param {string} name     The named export (e.g., 'useState')
 * @param {string} source   The module (e.g., 'react')
 * @returns {boolean}
 */
function isAlreadyImported(content, name, source) {
  // Matches: import { ..., name, ... } from 'source'
  const namedImportRegex = new RegExp(
    `import\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+['"]${source}['"]`,
    'i'
  );
  // Matches: import name from 'source'  (default import)
  const defaultImportRegex = new RegExp(
    `import\\s+${name}\\s+from\\s+['"]${source}['"]`,
    'i'
  );
  return namedImportRegex.test(content) || defaultImportRegex.test(content);
}

/**
 * Find what React named imports currently exist in the file.
 * Returns an object: { source: 'react', existing: ['useState', 'useEffect', ...] }
 *
 * @param {string} content
 * @returns {{ lineIndex: number, raw: string, specifiers: string[] } | null}
 */
function findReactImportLine(content) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/import\s+(?:type\s+)?\{/.test(line) && /from\s+['"]react['"]/.test(line)) {
      // Extract specifiers
      const match = line.match(/\{([^}]*)\}/);
      if (match) {
        const specifiers = match[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        return { lineIndex: i, raw: line, specifiers };
      }
    }
  }
  return null;
}

/**
 * Check if an identifier (hook or type) is used in the generated code.
 * @param {string} code
 * @param {string} name
 * @returns {boolean}
 */
function isUsedInCode(code, name) {
  return new RegExp(`\\b${name}\\b`).test(code);
}

/**
 * Analyse generated code and patch the file content with any missing imports.
 *
 * @param {string} fileContent   Current full file content (after code injection)
 * @param {string} generatedCode The AI-produced snippet
 * @param {string} filename      For extension-based decisions
 * @returns {string} Possibly updated file content
 */
function fixImports(fileContent, generatedCode, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const isReactFile = ['tsx', 'jsx', 'ts', 'js'].includes(ext);

  if (!isReactFile) return fileContent;

  // Collect all react identifiers used in generated code but missing from file
  const allReactIdentifiers = [...REACT_HOOKS, ...REACT_TYPES];
  const missing = allReactIdentifiers.filter(
    (name) =>
      isUsedInCode(generatedCode, name) &&
      !isAlreadyImported(fileContent, name, 'react')
  );

  if (missing.length === 0) return fileContent;

  const lines = fileContent.split('\n');
  const existingReactImport = findReactImportLine(fileContent);

  if (existingReactImport) {
    // Merge into the existing react import line
    const merged = [
      ...new Set([...existingReactImport.specifiers, ...missing]),
    ].sort();

    // Reconstruct the line
    const newLine = existingReactImport.raw.replace(
      /\{[^}]*\}/,
      `{ ${merged.join(', ')} }`
    );

    lines.splice(existingReactImport.lineIndex, 1, newLine);
  } else {
    // No existing react import — prepend a new one
    const isTypeScript = ['ts', 'tsx'].includes(ext);
    const newImport = isTypeScript
      ? `import React, { ${missing.join(', ')} } from 'react';`
      : `import { ${missing.join(', ')} } from 'react';`;

    // Insert after any 'use client' / 'use server' directives
    let insertAt = 0;
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      if (/^['"]use (client|server)['"]/.test(lines[i].trim())) {
        insertAt = i + 1;
        break;
      }
    }
    lines.splice(insertAt, 0, newImport);
  }

  return lines.join('\n');
}

module.exports = { fixImports };
