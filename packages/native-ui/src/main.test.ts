import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We must mock the core module since it's used by main.ts
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { initUI } from './main';

describe('Native UI initialization', () => {
    beforeEach(() => {
        document.body.innerHTML = `
      <h1 id="title"></h1>
      <div id="body-markdown"></div>
      <div id="choices-container"></div>
      <div id="custom-container" class="hidden">
        <textarea id="custom-text"></textarea>
      </div>
      <div id="loading"></div>
    `;
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders title and choices correctly from Tauri input', async () => {
        const mockInputData = {
            title: "Confirm Action",
            body: "Should we proceed?",
            choices: ["Yes", "No"],
            recommendedIndex: 0
        };

        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'get_input') return JSON.stringify(mockInputData);
            return "{}";
        });

        await initUI();

        const title = document.getElementById('title');
        expect(title?.textContent).toBe("Confirm Action");

        const choices = document.querySelectorAll('.choice-btn');
        expect(choices.length).toBe(2);
        expect(choices[0].textContent).toContain("Yes");
        expect(choices[0].classList.contains('recommended')).toBe(true);
    });

    it('shows custom input and focuses it if allowCustom is true', async () => {
        const mockInputData = {
            choices: ["Option"],
            allowCustom: true
        };

        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'get_input') return JSON.stringify(mockInputData);
            return "{}";
        });

        await initUI();

        const customContainer = document.getElementById('custom-container');
        expect(customContainer?.classList.contains('hidden')).toBe(false);

        const customText = document.getElementById('custom-text');
        expect(document.activeElement).toBe(customText);
    });

    it('hides the loading spinner after initialization with delay', async () => {
        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'get_input') return JSON.stringify({ title: "Test" });
            return "{}";
        });

        const initPromise = initUI();
        await initPromise;

        const loading = document.getElementById('loading');
        // Should be transparent but not yet hidden immediately
        expect(loading?.style.opacity).toBe('0');
        expect(loading?.classList.contains('hidden')).toBe(false);

        // Fast-forward 300ms
        vi.advanceTimersByTime(300);
        expect(loading?.classList.contains('hidden')).toBe(true);
    });

    it('hides the loading spinner even if initialization fails', async () => {
        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'get_input') throw new Error("Faulty Tauri command");
            return "{}";
        });

        await initUI();

        const loading = document.getElementById('loading');
        expect(loading?.classList.contains('hidden')).toBe(true);
    });
});
