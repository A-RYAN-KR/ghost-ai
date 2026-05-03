/**
 * Ghost Coder — End-to-End Test Suite
 * Tests the full pipeline: parse → AI → inject → verify
 * Run: node test-runner.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { injectFile } = require('./src/index');

// ──────────────────────────────────────────────
// Test fixtures: one per language
// ──────────────────────────────────────────────
const TEST_DIR = path.join(__dirname, 'test-files');

const TESTS = [
  {
    name: 'JavaScript (Node.js) — add two numbers',
    file: 'test_js.js',
    content: `// Simple utility module\n\n// @gen: write a function called addNumbers that takes two parameters a and b and returns their sum @@\n\nmodule.exports = { addNumbers };\n`,
    verify: (out) => {
      // Accept function declarations, arrow functions, const fn = ...
      return (out.includes('addNumbers') || out.includes('add')) &&
             (out.includes('return') || out.includes('=>'));
    },
  },
  {
    name: 'JavaScript (Node.js) — Express route',
    file: 'test_express.js',
    content: `const express = require('express');\nconst router = express.Router();\n\n// @gen: create a GET /users route that returns a JSON array of 3 mock users with id, name, email fields @@\n\nmodule.exports = router;\n`,
    verify: (out) => out.includes('router.get') || out.includes('res.json'),
  },
  {
    name: 'TypeScript — interface + function',
    file: 'test_ts.ts',
    content: `// TypeScript utility\n\n// @gen: create a TypeScript interface called User with id number, name string, email string, and createdAt Date fields @@\n\nexport {};\n`,
    verify: (out) => out.includes('interface') || out.includes('type'),
  },
  {
    name: 'HTML — login form',
    file: 'test_html.html',
    content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Test</title>\n</head>\n<body>\n  <!-- @gen: create a login form with email and password inputs and a submit button, with proper labels and accessibility attributes @@ -->\n</body>\n</html>\n`,
    verify: (out) => out.includes('<form') || out.includes('<input') || out.includes('email') || out.includes('password'),
  },
  {
    name: 'CSS — card component styles',
    file: 'test_css.css',
    content: `/* Component styles */\n\n/* @gen: write CSS styles for a .card class with box-shadow, border-radius, padding, and a hover lift animation @@ */\n`,
    verify: (out) => out.includes('.card') || out.includes('box-shadow') || out.includes('transform'),
  },
  {
    name: 'PHP — user class',
    file: 'test_php.php',
    content: `<?php\ndeclare(strict_types=1);\n\n// @gen: create a PHP 8 class called User with private properties id, name, email and a constructor with getters @@\n`,
    verify: (out) => out.includes('class') || out.includes('function'),
  },
  {
    name: 'Java (Spring Boot) — REST controller',
    file: 'test_java.java',
    content: `import org.springframework.web.bind.annotation.*;\nimport org.springframework.http.ResponseEntity;\nimport java.util.List;\n\n// @gen: create a Spring Boot REST controller class for /api/products with a GET endpoint that returns a list of Product objects @@\n`,
    verify: (out) => out.includes('class') || out.includes('@RestController') || out.includes('GetMapping'),
  },
];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeTest(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function readTest(file) {
  return fs.readFileSync(file, 'utf8');
}

function cleanup(file) {
  try { fs.unlinkSync(file); } catch { /* ignore */ }
}

function printSeparator() {
  console.log(chalk.dim('  ' + '─'.repeat(60)));
}

// ──────────────────────────────────────────────
// Main runner
// ──────────────────────────────────────────────
async function runTests() {
  console.log(chalk.hex('#6C63FF').bold('\n  ◆ Ghost Coder — Test Suite'));
  console.log(chalk.dim('  Testing all supported languages\n'));
  printSeparator();

  ensureDir(TEST_DIR);

  const results = [];

  const DELAY_BETWEEN_TESTS_MS = 2000; // avoid free-tier rate limits

  for (const test of TESTS) {
    const filePath = path.join(TEST_DIR, test.file);
    
    console.log(chalk.cyan(`\n  ▶ ${test.name}`));
    console.log(chalk.dim(`    File: ${test.file}`));

    // Write fixture
    writeTest(filePath, test.content);

    // Show what @gen: marker was used
    const markerLine = test.content
      .split('\n')
      .find((l) => l.includes('@gen:') || l.includes('<!-- @gen:') || l.includes('/* @gen:'));
    if (markerLine) {
      console.log(chalk.dim(`    Marker: `) + chalk.yellow(markerLine.trim().slice(0, 80)));
    }

    const startMs = Date.now();

    try {
      await injectFile(filePath, { contextLines: 50, usePrettier: false, silent: true });

      const output = readTest(filePath);
      const elapsed = Date.now() - startMs;

      // Check marker is GONE
      const markerGone = !output.includes('// @gen:') &&
                         !output.includes('<!-- @gen:') &&
                         !output.includes('/* @gen:');

      // Run custom verification
      const verified = test.verify(output);

      if (markerGone && verified) {
        console.log(chalk.green(`    ✓ PASSED`) + chalk.dim(` in ${elapsed}ms`));

        // Print the injected lines (everything that changed)
        const injected = output
          .split('\n')
          .filter((l) => l.trim() && !test.content.split('\n').includes(l))
          .slice(0, 8); // show up to 8 injected lines

        if (injected.length > 0) {
          console.log(chalk.dim('    Injected:'));
          injected.forEach((line) =>
            console.log(chalk.dim('      ') + chalk.white(line))
          );
          if (injected.length === 8) console.log(chalk.dim('      ...'));
        }

        results.push({ name: test.name, status: 'PASS', elapsed });
      } else {
        const reason = !markerGone ? 'marker still present in file' : 'output verification failed';
        console.log(chalk.red(`    ✗ FAILED`) + chalk.dim(` — ${reason}`));
        console.log(chalk.dim('    Output preview:'));
        output.split('\n').slice(0, 6).forEach((l) =>
          console.log(chalk.dim('      ') + chalk.gray(l))
        );
        results.push({ name: test.name, status: 'FAIL', reason });
      }
    } catch (e) {
      const elapsed = Date.now() - startMs;
      console.log(chalk.red(`    ✗ ERROR`) + chalk.dim(` — ${e.message}`));
      results.push({ name: test.name, status: 'ERROR', reason: e.message });
    } finally {
      cleanup(filePath);
    }

    printSeparator();

    // Rate-limit buffer between tests
    if (TESTS.indexOf(test) < TESTS.length - 1) {
      process.stdout.write(chalk.dim(`  ⏳ Waiting ${DELAY_BETWEEN_TESTS_MS / 1000}s before next test...\r`));
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_TESTS_MS));
      process.stdout.write(' '.repeat(60) + '\r');
    }
  }

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status !== 'PASS').length;

  console.log(chalk.hex('#6C63FF').bold('\n  ◆ Results'));
  results.forEach((r) => {
    const icon = r.status === 'PASS' ? chalk.green('✓') : chalk.red('✗');
    const time = r.elapsed ? chalk.dim(` (${r.elapsed}ms)`) : '';
    const reason = r.reason ? chalk.dim(` — ${r.reason}`) : '';
    console.log(`  ${icon} ${r.name}${time}${reason}`);
  });

  console.log(
    `\n  ${chalk.bold('Total:')} ${chalk.green(passed + ' passed')}, ${
      failed > 0 ? chalk.red(failed + ' failed') : chalk.dim('0 failed')
    } out of ${results.length}\n`
  );

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error(chalk.red('\nFatal error:'), e);
  process.exit(1);
});
