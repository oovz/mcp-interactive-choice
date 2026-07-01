#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";
import fs from "fs";
import * as z from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const version = pkg.version;

// CLI Arguments for the MCP server itself
const program = new Command();
program
    .name("mcp-interactive-choice")
    .description("MCP server for asking user interactive questions")
    .version(version)
    .option("--timeout <number>", "Default timeout in seconds (omit for no timeout)")
    .option("--binary-path <string>", "Path to the native-ui binary")
    .option("--silent", "Default to silent mode, preventing window focus steal")
    .option("--stdio", "Ignored for compatibility")
    .allowUnknownOption()
    .parse(process.argv);

const options = program.opts();
// undefined means no timeout (wait indefinitely). Set via --timeout <seconds> to enforce a global cap.
// Reject non-positive and non-numeric values: setTimeout clamps NaN/negative to 0, which would
// kill the native window before the user can respond.
const parsedTimeout = options.timeout !== undefined ? parseInt(options.timeout, 10) : undefined;
const DEFAULT_TIMEOUT: number | undefined =
    parsedTimeout !== undefined && !Number.isNaN(parsedTimeout) && parsedTimeout > 0
        ? parsedTimeout
        : undefined;

/**
 * Strategy to find the native-ui binary.
 * 1. Explicit --binary-path flag.
 * 2. npm installation path (bin/native-ui-<platform>-<arch>).
 * 3. Monorepo dev path (release, then debug).
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
        if (result.skipped) return "User skipped the question";
        // Use nullish check (not truthy) so an empty-string custom answer is
        // preserved, consistent with the choice handling below.
        if (result.custom_input != null) return `User provided answer: ${result.custom_input}`;
        // Use nullish coalescing so an empty-string choice ("") — a valid
        // selection — is preserved rather than misreported as cancellation.
        // The native binary signals cancellation with choice: null.
        return result.choice ?? "user cancelled the selection";
    } catch (e) {
        throw new Error(`Error parsing result: ${stdoutData}`);
    }
}

// Zod input schema for the ask_user tool. The SDK converts this to a JSON Schema
// for the tool listing and validates incoming arguments at the protocol boundary.
const AskUserSchema = z.object({
    title: z.string().optional().describe("(Optional) A concise, high-level summary of the decision required."),
    body: z.string().optional().describe("(Optional) Detailed context or explanation. Supports Markdown (code blocks, lists, etc.) to help the user make an informed choice."),
    choices: z.array(z.string()).min(1).describe("(Required) A list of predefined options for the user to select from."),
    recommended: z.string().optional().describe("(Optional) One of the exact strings from the 'choices' array that the agent recommends. The UI will highlight this option."),
});

const server = new McpServer(
    {
        name: "mcp-interactive-choice",
        version: version,
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.registerTool(
    "ask_user",
    {
        description: "Ask the user a question with several choices via a native GUI window. Supports Markdown in the body and a recommended choice. The user can also type a custom answer or skip the question entirely.",
        inputSchema: AskUserSchema,
    },
    async (args) => {
        const choices = args.choices;
        // Resolve timeout: CLI --timeout flag → no timeout (undefined)
        const timeoutMs: number | undefined = DEFAULT_TIMEOUT != null ? DEFAULT_TIMEOUT * 1000 : undefined;

        const isSilent = options.silent || false;

        const recommendedIndex = resolveRecommendedIndex(choices, args.recommended);

        const inputData = {
            title: args.title || "Action Required",
            body: args.body || "",
            choices,
            recommendedIndex,
        };

        const binaryPath = getBinaryPath();
        const spawnArgs = ["--input", JSON.stringify(inputData)];
        if (isSilent) {
            spawnArgs.push("--silent");
        }

        return new Promise((resolve, reject) => {
            const child = spawn(binaryPath, spawnArgs, {
                stdio: ["ignore", "pipe", "inherit"],
            });

            let stdoutData = "";
            child.stdout.on("data", (data) => {
                stdoutData += data.toString();
            });

            const timer = timeoutMs != null ? setTimeout(() => {
                child.kill();
                resolve({
                    content: [{ type: "text", text: "Error: User feedback timed out." }],
                    isError: true,
                });
            }, timeoutMs) : undefined;

            child.on("close", (code) => {
                if (timer != null) clearTimeout(timer);
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
                if (timer != null) clearTimeout(timer);
                const message = `Failed to launch interactive window: ${err.message}`;
                const error = new McpError(ErrorCode.InternalError, message);
                error.message = message;
                reject(error);
            });
        });
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Interactive Choice MCP Server (Tauri) running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
