# AGENTS.md — Using mcp-interactive-choice in Your Project

This file is intended for AI coding agents (Claude Code, Cursor, Copilot, etc.) that want to install and use the **mcp-interactive-choice** MCP server to ask humans questions via a native desktop window.

## What It Does

An MCP server that exposes one tool, `ask_user`, which opens a native desktop window (Tauri) to present a multiple-choice question to the human. The human can pick a choice, type a custom answer, skip, or close the window. The result is returned to the agent as text.

Use it when you need a human decision mid-task and a terminal prompt would break the user's flow.

## Installation

### Option A: npx (no install needed)

Add to your MCP client config (e.g. `claude_desktop_config.json`, `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "interactive-choice": {
      "command": "npx",
      "args": ["-y", "mcp-interactive-choice"]
    }
  }
}
```

### Option B: Local build

```bash
git clone https://github.com/oovz/mcp-interactive-choice.git
cd mcp-interactive-choice
npm install
npm run build
```

Then register with an absolute path:

```json
{
  "mcpServers": {
    "interactive-choice": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-interactive-choice/dist/index.js"]
    }
  }
}
```

### Requirements

- **Node.js >= 20**
- **Rust toolchain** (only for local builds)

## CLI Flags

| Flag | Description |
|------|-------------|
| `--timeout <seconds>` | Global cap on wait time. Must be a positive integer. Without it, the server waits indefinitely. |
| `--silent` | Prevents the window from stealing focus on launch. Useful if the tool is called frequently. |
| `--binary-path <path>` | Override the path to the native binary. |

Example with a 55-second timeout (recommended for clients with a 60s client-side timeout):

```json
{
  "mcpServers": {
    "interactive-choice": {
      "command": "npx",
      "args": ["-y", "mcp-interactive-choice", "--timeout", "55"]
    }
  }
}
```

## Tool: `ask_user`

### Arguments

| Argument | Required | Type | Description |
|----------|----------|------|-------------|
| `title` | no | string | Short headline for the question. Defaults to `"Action Required"`. |
| `body` | no | string | Detailed context in Markdown (code blocks, lists, bold, etc.). HTML is sanitized with DOMPurify. |
| `choices` | **yes** | string[] | A non-empty list of predefined options. |
| `recommended` | no | string | One of the strings from `choices` that you suggest. Must match exactly after trimming whitespace, or the call returns an error. |

### Response

The tool returns `content: [{ type: "text", text: <string> }]`. Possible values:

| `text` | Meaning |
|--------|---------|
| The selected choice string | Human clicked a choice button |
| `"User provided answer: {text}"` | Human typed a custom answer |
| `"User skipped the question"` | Human clicked Skip |
| `"user cancelled the selection"` | Human closed the window |
| `"Error: User feedback timed out."` | `--timeout` elapsed (only if set) |

Invalid arguments (empty `choices`, `recommended` not matching) return `isError: true` with a descriptive message.

### Example call

```json
{
  "name": "ask_user",
  "arguments": {
    "title": "Which database should I use?",
    "body": "The project needs a database.\n\n**Postgres** is more feature-rich.\n**SQLite** is simpler to deploy.",
    "choices": ["PostgreSQL", "SQLite", "MongoDB"],
    "recommended": "PostgreSQL"
  }
}
```

## When to Use This Tool

- You need a human decision that has a small set of clear options.
- A terminal prompt would interrupt the user's workflow.
- You want to recommend a specific option while still letting the human choose.

**Don't use it for:**
- Yes/no questions — most clients handle those natively.
- Questions where you don't need the answer to proceed.
- Long-form text input only (no choices) — the custom input field is secondary.

## Client Compatibility

| Client | Behavior |
|--------|---------|
| Antigravity, VS Code / Copilot | No client-side timeout. Works with default indefinite wait. |
| Claude Desktop, Cursor | Enforces a 60-second client-side timeout. Pass `--timeout 55` so the server returns a clean timeout error before the client's timeout fires. |
