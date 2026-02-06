# Native UI (Tauri)

This package contains the native desktop window for the Interactive Choice MCP Server. It is built using [Tauri](https://tauri.app/) and vanilla TypeScript/HTML/CSS.

## ✨ Features

- **Markdown Rendering**: Uses `marked` to render rich text descriptions provided by the AI.
- **Responsive Design**: Supports light and dark modes based on system settings.
- **Zero Configuration**: Receives all necessary data via CLI arguments matched with Tauri's state.

## 🛠️ Development

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)

### Commands

- `npm run dev`: Runs the Vite development server for the frontend.
- `npm run tauri dev`: Runs the application in development mode with hot-reloading.
- `npm run build`: Builds the production-ready binary.
- `npm run test`: Runs unit tests using Vitest and JSDOM.

### Testing with Custom Data
You can test the UI with specific parameters using the `--input` flag:
```powershell
npm run tauri dev -- -- -- --input '{"title":"Test Title","body":"**Hello** from Markdown","choices":["Option A","Option B"],"recommendedIndex":0,"allowCustom":true}'
```

## 🏗️ Architecture

1. **Frontend**: A vanilla TypeScript application (`src/main.ts`) that:
   - Fetches input data from the Rust backend via `get_input`.
   - Renders the UI and handles user interactions.
   - Returns the selection via `on_submit`.
2. **Backend**: A Rust/Tauri core (`src-tauri/src/main.rs`) that:
   - Parses CLI arguments (specifically `--input`).
   - Manages the native window lifecycle.
   - Pipes the user result back to standard output.

## 🧪 Testing

This package uses [Vitest](https://vitest.dev/) for unit testing the frontend logic, mocking the Tauri IPC layer to ensure the UI behaves correctly given various input payloads.
