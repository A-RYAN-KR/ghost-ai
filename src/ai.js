'use strict';

/**
 * AI Module — OpenRouter Backend
 *
 * Sends the extracted context + prompt to OpenRouter and
 * returns raw code (no markdown, no prose) ready for injection.
 */

const { buildContextBlock } = require('./parser');

/**
 * Generate code for a single @gen: marker.
 *
 * @param {object} params
 * @param {string}   params.prompt        The instruction from // @gen: ...
 * @param {string}   params.filename      Basename of the file (for language hints)
 * @param {string[]} params.contextAbove  Lines above the marker
 * @param {string[]} params.contextBelow  Lines below the marker
 * @param {number}   params.lineIndex     0-based line index (for display)
 * @param {string}   params.indent        Leading whitespace on the marker line
 * @returns {Promise<string>} Raw generated code
 */
async function generateCode({
  prompt,
  filename,
  contextAbove,
  contextBelow,
  lineIndex,
  indent,
}) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY; // Fallback for transition
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set.');
  }

  const modelName =
    process.env.AI_MODEL || 'inclusionai/ling-2.6-1t:free';

  const temperature = parseFloat(process.env.AI_TEMPERATURE || '0.1');

  // Build language-specific hints for the system prompt
  const langHints = {
    'HTML5': 'Follow semantic HTML5 best practices. Use proper tags, attributes, and accessibility (aria) where relevant.',
    'CSS3': 'Write clean, modern CSS. Use CSS variables, flexbox/grid where appropriate. No inline styles.',
    'SCSS': 'Use SCSS features (variables, nesting, mixins) idiomatically.',
    'PHP': 'Write modern PHP 8+ code. Use strict types, named arguments, and PSR-12 coding standards.',
    'Java (Spring Boot)': 'Write Spring Boot 3.x code. Use proper annotations (@RestController, @Service, @Repository, etc.), dependency injection, and follow Java naming conventions.',
    'Kotlin (Spring Boot)': 'Write idiomatic Kotlin with Spring Boot 3.x. Use data classes, extension functions, and coroutines where appropriate.',
    'JavaScript (Node.js / Express.js)': 'Write modern Node.js code. Prefer async/await over callbacks. For Express, use proper middleware patterns, error handling, and router structure.',
    'SQL': 'Write ANSI SQL. Prefer explicit JOINs over implicit. Use parameterized queries pattern in comments.',
  };

  const ext = filename.split('.').pop().toLowerCase();
  const langMap = {
    // JavaScript ecosystem
    ts: 'TypeScript',
    tsx: 'TypeScript React (TSX)',
    js: 'JavaScript (Node.js / Express.js)',
    jsx: 'JavaScript React (JSX)',
    mjs: 'JavaScript ESM (Node.js)',
    cjs: 'JavaScript CommonJS (Node.js)',
    // Web
    html: 'HTML5',
    css: 'CSS3',
    scss: 'SCSS',
    sass: 'Sass',
    // PHP
    php: 'PHP',
    // Java ecosystem
    java: 'Java (Spring Boot)',
    kt: 'Kotlin (Spring Boot)',
    // Config / other
    json: 'JSON',
    xml: 'XML',
    yaml: 'YAML',
    yml: 'YAML',
    sql: 'SQL',
    sh: 'Bash',
  };
  const language = langMap[ext] || 'code';
  const extraHint = langHints[language] || '';
  const systemInstruction = `You are an elite ${language} developer with 15+ years of experience. Your sole job is to write production-quality code snippets that will be injected directly into existing source files. You operate in stealth mode — your output is indistinguishable from hand-written code. ${extraHint}`;

  const contextBlock = buildContextBlock(
    contextAbove,
    contextBelow,
    lineIndex + 1 // 1-based for humans
  );

  const userMessage = `
FILE: ${filename}
LANGUAGE: ${language}

TASK: Replace the marker line (marked as "<<< REPLACE THIS LINE >>>") with real, working ${language} code that fulfills the following instruction:

INSTRUCTION: ${prompt}

FILE CONTEXT (surrounding lines with line numbers):
\`\`\`
${contextBlock}
\`\`\`

STRICT OUTPUT RULES — violating any rule is a critical failure:
1. Output ONLY the code that replaces the marker line. Nothing else.
2. ZERO prose, commentary, or explanation before or after the code.
3. ZERO markdown fences (\`\`\`, \`\`\`tsx, etc.). Raw code only.
4. MATCH the existing indentation style (tabs vs spaces, same indent level as the marker).
   The marker line had this leading whitespace: "${indent.replace(/ /g, '·').replace(/\t/g, '→')}"
   Every line you emit must start with that same indentation.
5. Use ONLY imports that already exist in the file context above. Do NOT add new import statements — those will be handled separately.
6. Follow the naming conventions, patterns, and style visible in the surrounding code.
7. If the instruction requires multiple lines, output all of them (properly indented).
8. Do NOT include the // @gen: comment in your output.
9. The code must be syntactically correct and immediately compilable/runnable.

Output the replacement code now:`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/ghost-coder',
      'X-Title': 'Ghost Coder'
    },
    body: JSON.stringify({
      model: modelName,
      temperature,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API Error (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  const text = result.choices[0].message.content.trim();

  // Strip any accidental markdown fences the model might still add
  const stripped = stripMarkdownFences(text);

  return stripped;
}

/**
 * Defensively remove markdown code fences if the model disobeys.
 * @param {string} text
 * @returns {string}
 */
function stripMarkdownFences(text) {
  // Remove opening fence: ```lang or ```
  let result = text.replace(/^```[a-zA-Z]*\n?/, '');
  // Remove closing fence
  result = result.replace(/\n?```\s*$/, '');
  return result.trim();
}

module.exports = { generateCode };
