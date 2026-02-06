import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ErrorCode,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI Arguments for the MCP server itself
const program = new Command();
program
    .option("--timeout <number>", "Default timeout in seconds", "60")
    .option("--binary-path <string>", "Path to the native-ui binary")
    .option("--stdio", "Ignored for compatibility")
    .allowUnknownOption()
    .parse(process.argv);

const options = program.opts();
const DEFAULT_TIMEOUT = parseInt(options.timeout);

/**
 * Strategy to find the native-ui binary.
 * 1. Explicit --binary-path flag.
 * 2. Monorepo dev path.
 * 3. npm installation path (bin/native-ui-<platform>-<arch>).
 */
function getBinaryPath(): string {
    if (options.binaryPath) return options.binaryPath;

    const platform = process.platform;
    const arch = process.arch;
    const exeSuffix = platform === "win32" ? ".exe" : "";

    // 1. Dev Path (Monorepo)
    // When running from root/dist/index.js, native-ui is in root/packages/native-ui/...
    const devPath = path.resolve(
        __dirname,
        `../packages/native-ui/src-tauri/target/release/native-ui${exeSuffix}`
    );

    // 2. NPM Path (standardized binary name)
    const npmPath = path.resolve(__dirname, `../bin/native-ui-${platform}-${arch}${exeSuffix}`);

    if (fs.existsSync(npmPath)) return npmPath;
    if (fs.existsSync(devPath)) return devPath;

    // Fallback to debug path if release doesn't exist
    const debugPath = path.resolve(
        __dirname,
        `../packages/native-ui/src-tauri/target/debug/native-ui${exeSuffix}`
    );
    if (fs.existsSync(debugPath)) return debugPath;

    return npmPath;
}

/**
 * Resolves the recommended choice string to its index in the choices array.
 * Returns -1 if no recommendation is provided.
 * @throws McpError if the recommendation doesn't match any choice.
 */
export function resolveRecommendedIndex(choices: string[], recommended?: string | null): number {
    if (recommended === undefined || recommended === null) return -1;

    const target = recommended.trim();
    const index = choices.findIndex(c => c.trim() === target);

    if (index === -1) {
        const message = `recommended choice "${recommended}" does not match any available choices. Available: ${choices.join(", ")}`;
        const error = new McpError(ErrorCode.InvalidParams, message);
        error.message = message; // Avoid double-prefixing in certain clients
        throw error;
    }
    return index;
}

/**
 * Parses the stdout from the native-ui binary.
 * @returns The user's selection or custom input.
 * @throws Error if parsing fails.
 */
export function parseToolResult(stdoutData: string): string {
    const cleanedStdout = stdoutData.split('\n')
        .filter(line => !line.trim().startsWith('DEBUG'))
        .join('\n')
        .trim();

    if (!cleanedStdout) return "user cancelled the selection";

    try {
        const result = JSON.parse(cleanedStdout);
        return result.custom_input || result.choice || "user cancelled the selection";
    } catch (e) {
        throw new Error(`Error parsing result: ${stdoutData}`);
    }
}

const server = new Server(
    {
        name: "mcp-interactive-choice",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "ask_user",
                description: "Ask the user a question with several choices via a native GUI window. Supports Markdown in the body and a recommended choice.",
                inputSchema: {
                    type: "object",
                    properties: {
                        title: {
                            type: "string",
                            description: "(Optional) A concise, high-level summary of the decision required.",
                        },
                        body: {
                            type: "string",
                            description: "(Optional) Detailed context or explanation. Supports Markdown (code blocks, lists, etc.) to help the user make an informed choice.",
                        },
                        choices: {
                            type: "array",
                            items: { type: "string" },
                            description: "(Required) A list of predefined options for the user to select from.",
                        },
                        recommended: {
                            type: "string",
                            description: "(Optional) One of the exact strings from the 'choices' array that the agent recommends. The UI will highlight this option.",
                        },
                        allowCustom: {
                            type: "boolean",
                            description: "(Optional) Whether to provide a text area for the user to type a custom response not in the choices list. Defaults to false.",
                            default: false
                        },
                        timeoutSec: {
                            type: "number",
                            description: `(Optional) How long to wait for a user response in seconds. Defaults to ${DEFAULT_TIMEOUT}. If exceeded, the tool returns a timeout error.`,
                        }
                    },
                    required: ["choices"],
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "ask_user") {
        const args = request.params.arguments as any;
        const choices = args.choices as string[];
        const timeout = (args.timeoutSec || DEFAULT_TIMEOUT) * 1000;

        const recommendedIndex = resolveRecommendedIndex(choices, args.recommended);

        const inputData = {
            title: args.title || "Action Required",
            body: args.body || "",
            choices,
            recommendedIndex,
            allowCustom: !!args.allowCustom,
        };

        const binaryPath = getBinaryPath();

        return new Promise((resolve, reject) => {
            const child = spawn(binaryPath, ["--input", JSON.stringify(inputData)], {
                stdio: ["ignore", "pipe", "inherit"],
            });

            let stdoutData = "";
            child.stdout.on("data", (data) => {
                stdoutData += data.toString();
            });

            const timer = setTimeout(() => {
                child.kill("SIGKILL");
                resolve({
                    content: [{ type: "text", text: "Error: User feedback timed out." }],
                    isError: true,
                });
            }, timeout);

            child.on("close", (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    try {
                        const textResult = parseToolResult(stdoutData);
                        resolve({
                            content: [{ type: "text", text: textResult }],
                        });
                    } catch (e: any) {
                        resolve({
                            content: [{ type: "text", text: e.message }],
                            isError: true,
                        });
                    }
                } else {
                    resolve({
                        content: [{ type: "text", text: `Tool window closed unexpectedly (code ${code})` }],
                        isError: true,
                    });
                }
            });

            child.on("error", (err) => {
                clearTimeout(timer);
                const message = `Failed to launch interactive window: ${err.message}`;
                const error = new McpError(ErrorCode.InternalError, message);
                error.message = message;
                reject(error);
            });
        });
    }

    const message = `Tool not found: ${request.params.name}`;
    const error = new McpError(ErrorCode.MethodNotFound, message);
    error.message = message;
    throw error;
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Interactive Choice MCP Server (Tauri) running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
