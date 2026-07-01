import { describe, it, expect } from "vitest";
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

    it("should return custom_input with prefix if provided", () => {
        const stdout = '{"choice":null,"index":-1,"custom_input":"My Custom"}';
        expect(parseToolResult(stdout)).toBe("User provided answer: My Custom");
    });

    it("should return skip message when skipped is true", () => {
        const stdout = '{"choice":null,"index":-1,"custom_input":null,"skipped":true}';
        expect(parseToolResult(stdout)).toBe("User skipped the question");
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

// Complex JSON edge cases derived from RFC 8259 (the JSON spec) and community
// research on JSON parser differentials:
//  - RFC 8259 §7 (strings): surrogate pairs, \uXXXX escapes, control chars
//  - "Parsing JSON is a Minefield" (seriot.ch/security/parsing_json.html)
//  - "Cross-Language Differential Testing of JSON Parsers" (ASIACCS 2024)
//  - Bishop Fox "JSON Interoperability Vulnerabilities"
// These verify parseToolResult survives tricky string values that may appear
// in user choices / custom input and round-trip through the native binary.
describe("parseToolResult - complex JSON edge cases (RFC 8259)", () => {
    it("handles emoji and astral-plane characters (UTF-16 surrogate pairs)", () => {
        // U+1F600 (😀) is encoded as the surrogate pair \uD83D\uDE00 in JSON.
        const stdout = '{"choice":"\\uD83D\\uDE00 Pick 😀","index":0,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe("😀 Pick 😀");
    });

    it("handles the G clef (U+1D11E) encoded as a surrogate pair", () => {
        // Classic RFC 8259 example: U+1D11E = \uD834\uDD1E
        const stdout = '{"choice":"\\uD834\\uDD1E","index":0,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe("\uD834\uDD1E");
    });

    it("handles \\uXXXX escape notation for BMP characters", () => {
        // U+00E9 (é) encoded as \u00E9 — semantically equal to the literal char.
        const stdout = '{"choice":"caf\\u00E9","index":0,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe("café");
    });

    it("handles escaped quotes and backslashes in a choice", () => {
        const stdout = '{"choice":"He said \\"hi\\" \\\\ \\/","index":0,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe('He said "hi" \\ /');
    });

    it("handles control characters (\\n, \\t, \\r) in a choice", () => {
        const stdout = '{"choice":"line1\\nline2\\ttab\\rreturn","index":0,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe("line1\nline2\ttab\rreturn");
    });

    it("handles U+2028 and U+2029 (line/paragraph separators)", () => {
        // Valid in JSON per RFC 8259; valid in JS since ES2019. Must round-trip.
        const stdout = '{"choice":"a\\u2028b\\u2029c","index":0,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe("a\u2028b\u2029c");
    });

    it("handles a choice value that is itself valid JSON-looking text", () => {
        const choice = '{"nested":"value","arr":[1,2,3]}';
        const stdout = `{"choice":${JSON.stringify(choice)},"index":0,"custom_input":null}`;
        expect(parseToolResult(stdout)).toBe(choice);
    });

    it("handles an empty-string choice (valid per RFC 8259)", () => {
        const stdout = '{"choice":"","index":0,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe("");
    });

    it("handles whitespace-only choice strings", () => {
        const stdout = '{"choice":"   \\n\\t  ","index":0,"custom_input":null}';
        expect(parseToolResult(stdout)).toBe("   \n\t  ");
    });

    it("handles complex custom_input with mixed unicode and escaping", () => {
        const custom = 'Answer: "quotes" \\ backslash\nnewline\ttab 😀';
        const stdout = `{"choice":null,"index":-1,"custom_input":${JSON.stringify(custom)}}`;
        expect(parseToolResult(stdout)).toBe(`User provided answer: ${custom}`);
    });

    it("handles a long choice string (10k chars)", () => {
        const long = "x".repeat(10000);
        const stdout = `{"choice":${JSON.stringify(long)},"index":0,"custom_input":null}`;
        expect(parseToolResult(stdout)).toBe(long);
    });

    it("handles mixed CRLF line endings and DEBUG lines around JSON", () => {
        const stdout = "DEBUG: start\r\n  {\"choice\":\"ok\",\"index\":0,\"custom_input\":null}\r\nDEBUG: end\r\n";
        expect(parseToolResult(stdout)).toBe("ok");
    });

    it("handles a UTF-8 BOM (U+FEFF) prefix before the JSON payload", () => {
        const stdout = "\uFEFF{\"choice\":\"bom\",\"index\":0,\"custom_input\":null}";
        // JSON.parse tolerates a leading BOM; the choice must still parse.
        expect(parseToolResult(stdout)).toBe("bom");
    });

    it("throws on trailing garbage after the JSON object (strict parse)", () => {
        const stdout = '{"choice":"a","index":0,"custom_input":null} NOT JSON';
        expect(() => parseToolResult(stdout)).toThrow("Error parsing result");
    });

    it("preserves a lone high surrogate escape without crashing (V8 behaviour)", () => {
        // \uD800 with no following low surrogate is a lone surrogate. Per RFC 8259
        // the grammar accepts it but the result is "implementation defined".
        // V8's JSON.parse preserves the lone surrogate (U+D800) as-is rather than
        // replacing it with U+FFFD. This verifies parseToolResult does not crash
        // and matches V8's stable behaviour.
        const stdout = '{"choice":"\\uD800","index":0,"custom_input":null}';
        const result = parseToolResult(stdout);
        expect(result).toBe("\uD800");
    });
});

describe("resolveRecommendedIndex - complex string edge cases", () => {
    it("matches a recommended choice containing emoji", () => {
        const choices = ["Plain", "😀 Emoji", "🎉"];
        expect(resolveRecommendedIndex(choices, "😀 Emoji")).toBe(1);
        expect(resolveRecommendedIndex(choices, "🎉")).toBe(2);
    });

    it("matches a recommended choice containing quotes and backslashes", () => {
        const choices = ['He said "hi"', 'path\\to\\file', "normal"];
        expect(resolveRecommendedIndex(choices, 'path\\to\\file')).toBe(1);
    });

    it("matches a recommended choice that looks like JSON", () => {
        const choices = ['{"k":"v"}', '[1,2,3]', "plain"];
        expect(resolveRecommendedIndex(choices, '{"k":"v"}')).toBe(0);
    });

    it("trims whitespace around a recommended choice with internal newlines", () => {
        const choices = ["line1\nline2", "other"];
        expect(resolveRecommendedIndex(choices, "  line1\nline2  ")).toBe(0);
    });

    it("rejects a recommended value that is an empty string when no empty choice exists", () => {
        const choices = ["A", "B"];
        expect(() => resolveRecommendedIndex(choices, "")).toThrow(McpError);
    });

    it("matches an empty-string choice when recommended is empty", () => {
        const choices = ["", "non-empty"];
        expect(resolveRecommendedIndex(choices, "")).toBe(0);
    });
});

describe("parseToolResult - custom_input edge cases", () => {
    it("returns custom_input even when it is an empty string (nullish check, not truthy)", () => {
        // The native binary's submitCustom() currently rejects empty input, but
        // parseToolResult must not regress if that guard ever changes. An empty
        // custom_input is a valid (if unusual) answer and must not fall through
        // to the cancellation message.
        const stdout = '{"choice":null,"index":-1,"custom_input":""}';
        expect(parseToolResult(stdout)).toBe("User provided answer: ");
    });

    it("returns custom_input when it is the string '0'", () => {
        // "0" is a non-empty string and thus truthy in JS, so this does not
        // distinguish the nullish check from the old truthy check. It is kept
        // as a straightforward round-trip guard for a numeric-looking answer.
        const stdout = '{"choice":null,"index":-1,"custom_input":"0"}';
        expect(parseToolResult(stdout)).toBe("User provided answer: 0");
    });
});
