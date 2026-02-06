import { describe, it, expect, vi } from "vitest";
import { resolveRecommendedIndex, parseToolResult } from "./index.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

describe("resolveRecommendedIndex", () => {
    const choices = ["Apple", "Banana", "Cherry"];

    it("should return -1 if recommended is null or undefined", () => {
        expect(resolveRecommendedIndex(choices, null)).toBe(-1);
        expect(resolveRecommendedIndex(choices, undefined)).toBe(-1);
    });

    it("should return the correct index for a valid recommendation", () => {
        expect(resolveRecommendedIndex(choices, "Banana")).toBe(1);
    });

    it("should handle whitespace correctly", () => {
        expect(resolveRecommendedIndex(choices, "  Cherry  ")).toBe(2);
    });

    it("should throw McpError for invalid recommendation", () => {
        expect(() => resolveRecommendedIndex(choices, "Dragonfruit")).toThrow(McpError);
        try {
            resolveRecommendedIndex(choices, "Dragonfruit");
        } catch (e: any) {
            expect(e.code).toBe(ErrorCode.InvalidParams);
        }
    });

    it("should throw McpError with clean message (no double prefix)", () => {
        let thrownError: any;
        try {
            resolveRecommendedIndex(choices, "Dragonfruit");
        } catch (e: any) {
            thrownError = e;
        }
        expect(thrownError).toBeDefined();
        expect(thrownError.message).not.toContain("MCP error");
        expect(thrownError.message).toBe('recommended choice "Dragonfruit" does not match any available choices. Available: Apple, Banana, Cherry');
    });
});

describe("parseToolResult", () => {
    it("should return the choice if provided", () => {
        const stdout = '{"choice":"Apple","index":0,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe("Apple");
    });

    it("should return custom_input if provided", () => {
        const stdout = '{"choice":null,"index":-1,"custom_input":"My Custom"}';
        expect(parseToolResult(stdout)).toBe("My Custom");
    });

    it("should return cancellation message if choice and custom_input are null", () => {
        const stdout = '{"choice":null,"index":-1,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe("user cancelled the selection");
    });

    it("should filter out DEBUG lines", () => {
        const stdout = 'DEBUG: some log\n{"choice":"Banana","index":1,"custom_input":null}\nDEBUG: another log';
        expect(parseToolResult(stdout)).toBe("Banana");
    });

    it("should return cancellation message for empty stdout", () => {
        expect(parseToolResult("")).toBe("user cancelled the selection");
        expect(parseToolResult("   \n  ")).toBe("user cancelled the selection");
    });

    it("should throw for invalid JSON", () => {
        expect(() => parseToolResult("not json")).toThrow("Error parsing result");
    });
});
