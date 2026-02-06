# Interactive Choice MCP Server (Native UI)

A Model Context Protocol (MCP) server that allows AI agents to ask questions through a **native window** (built with Tauri), preventing context-breaking interruptions and providing a premium user experience.

## ✨ Features

- **Native Window**: A native window appears when the agent needs your input.
- **Markdown Support**: Detailed descriptions from the AI are rendered in markdown.
- **Cross-Platform**: Supports Windows and macOS.

## 🚀 Setup & Installation

### Option A: Run with npx (Recommended)
You can use the server directly via `npx` in your MCP client configuration:

```json
{
  "mcpServers": {
    "interactive-choice": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-interactive-choice"
      ]
    }
  }
}
```

### Option B: Local Build
#### 1. Build Everything
From the project root:
```bash
npm install
npm run build
```
This will:
1. Build the frontend (Vite)
2. Build the Tauri binary (Rust)
3. Compile the MCP server (TypeScript)
4. Copy the binary to the `bin/` folder

#### 2. Register with your MCP Client
Update your configuration (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "interactive-choice": {
      "command": "node",
      "args": [
        "/path/to/mcp-interactive-choice/dist/index.js"
      ]
    }
  }
}
```

## 🛠️ Tool: `ask_user`

The agent calls this tool when it needs a human decision.

**Arguments:**
- `title` (optional): Short headline for the question.
- `body` (optional): Detailed context in Markdown.
- `choices` (required): List of strings.
- `recommended` (optional): One of the strings from `choices` that the agent suggests.
- `allowCustom` (optional): Boolean to show a text box for custom input.
- `timeoutSec` (optional): How long to wait (in seconds) before the tool auto-fails.

**Response:**
- Returns the string value of the selected choice.
- Returns the custom text if provided.
- Returns `"user cancelled the selection"` if the window is closed manually.

## 🛠️ Development & Debugging

### UI Development (Hot Reloading)
To iterate on the UI with hot reloading:
1. Go to `packages/native-ui`.
2. Run `npm run tauri dev`.

**Running with CLI parameters (Windows/PowerShell):**
To test specific data during development, use the flag `--input`:
```powershell
npm run tauri dev -- -- -- --input '{"title":"Dev Test","choices":["A","B"]}'
```

### 🔍 Testing with MCP Inspector
1. **Build Everything**: `npm run build` at the root.
2. **Run Inspector** from the project root:
```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
```

## 📝 License
MIT
