# ghost-ai

> Background code quality daemon for TypeScript, JavaScript, and Java projects.

---

## What it does

Write `// @gen: <your instruction> @@` anywhere in a `.tsx`, `.ts`, `.js`, `.jsx`, or `.java` file and hit save. The daemon detects the marker, sends the surrounding code as context to an **OpenRouter AI model**, and atomically replaces the comment with real, working code — indented correctly, formatted with Prettier, and with missing React imports auto-injected.

---

## Installation

### Global (run anywhere)

```bash
npm install -g ghost-ai
```

### Local (per-project)

```bash
npm install --save-dev ghost-ai
```

---

## Setup

1. **Get an OpenRouter API key** → [https://openrouter.ai/keys](https://openrouter.ai/keys)

2. **Create a `.env` file** in the directory where you run the daemon:

```env
OPENROUTER_API_KEY=your_key_here
AI_MODEL=inclusionai/ling-2.6-1t:free # optional, default shown
AI_TEMPERATURE=0.1                    # optional, 0.0–1.0
```

3. **Start the daemon:**

```bash
# Watch current directory
ghost

# Watch specific directories
ghost ./src ./lib

# Using the full package name
ghost-ai ./src
```

---

## Usage

Type the marker anywhere in a watched file, ending it with `@@` so the daemon knows you're done typing:

```tsx
function LoginForm() {
  // @gen: Create a login form with email and password fields using React state @@
}
```

Hit **Ctrl+S**. Within seconds, the comment is replaced:

```tsx
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log({ email, password });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

Missing imports (e.g. `useState`, `FormEvent`) are silently added to the top of the file.

---

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--dir`, `-d` | Directory to watch (repeatable) | `cwd` |
| `--ext` | Comma-separated extensions | `.tsx,.ts,.js,.jsx,.java` |
| `--context` | Lines of context sent to AI | `50` |
| `--no-prettier` | Disable Prettier formatting | Prettier on |
| `--silent` | Suppress all console output | off |
| `--help`, `-h` | Show help | — |

---

## Running in Background (Windows)

Using **pm2** (recommended):

```bash
npm install -g pm2
pm2 start ghost --name linter -- ./src
pm2 save
pm2 startup
```

---

## Running in Background (macOS/Linux)

```bash
nohup ghost ./src > /dev/null 2>&1 &
```

---

## Programmatic API

```js
const { injectFile, startWatcher } = require('ghost-ai');

// Process a single file manually
await injectFile('/absolute/path/to/file.tsx', {
  contextLines: 50,
  usePrettier: true,
  silent: false,
});

// Start the watcher programmatically
startWatcher({
  watchDirs: ['/path/to/src'],
  extensions: ['.tsx', '.ts'],
  contextLines: 50,
  usePrettier: true,
  silent: false,
});
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | **Required.** Your OpenRouter API key | — |
| `AI_MODEL` | OpenRouter AI model to use | `inclusionai/ling-2.6-1t:free` |
| `AI_TEMPERATURE` | Generation temperature (0.0–1.0) | `0.1` |
| `WATCH_EXTENSIONS` | Extensions to watch | `.tsx,.ts,.js,.jsx,.java` |

---

## How it works

```
Save event
    │
    ▼
chokidar detects change (debounced 300ms)
    │
    ▼
Quick scan: does file contain // @gen: and @@ ?
    │
    ├─ No ──► ignore
    │
    ▼
Parse all markers + extract context (50 lines above/below)
    │
    ▼
Call OpenRouter API with stealth prompt
    │
    ▼
Apply indentation + Prettier format
    │
    ▼
Splice into file content (reverse order for multiple markers)
    │
    ▼
Auto-fix missing React imports
    │
    ▼
Atomic write (temp file → rename)
```

---

## License

MIT
