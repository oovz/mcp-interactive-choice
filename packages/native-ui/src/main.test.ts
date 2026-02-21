import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the core module since it's used by main.ts
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// Mock the window module for setSize/center calls
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: vi.fn(() => ({
        setSize: vi.fn(),
        center: vi.fn(),
    })),
    LogicalSize: vi.fn((w: number, h: number) => ({ width: w, height: h })),
}));

import { invoke } from '@tauri-apps/api/core';
import { initUI, setupEvents, resetSubmitForTest } from './main';

describe('Native UI initialization', () => {
    beforeEach(() => {
        document.body.innerHTML = `
      <h1 id="title"></h1>
      <div id="body-container">
        <div id="body-markdown"></div>
      </div>
      <div id="choices-container"></div>
      <div id="custom-container">
        <textarea id="custom-text"></textarea>
        <button id="submit-custom"></button>
      </div>
      <button id="skip-btn"></button>
      <div id="loading" class="overlay"></div>
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

    it('always shows the custom input section (no hidden class)', async () => {
        const mockInputData = {
            choices: ["Option"]
        };

        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'get_input') return JSON.stringify(mockInputData);
            return "{}";
        });

        await initUI();

        const customContainer = document.getElementById('custom-container');
        expect(customContainer?.classList.contains('hidden')).toBe(false);
    });

    it('hides body-container when no body is provided', async () => {
        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'get_input') return JSON.stringify({ title: "Test", choices: ["A"] });
            return "{}";
        });

        await initUI();

        const bodyContainer = document.getElementById('body-container');
        expect(bodyContainer?.classList.contains('hidden')).toBe(true);
    });

    it('hides the loading spinner after initialization with delay', async () => {
        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'get_input') return JSON.stringify({ title: "Test" });
            return "{}";
        });

        const initPromise = initUI();
        await initPromise;

        const loading = document.getElementById('loading');
        // Should have fade-out class but not yet hidden
        expect(loading?.classList.contains('fade-out')).toBe(true);
        expect(loading?.classList.contains('hidden')).toBe(false);

        // Fast-forward 350ms for the fade-out transition
        vi.advanceTimersByTime(350);
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

    it('has skip button element present in DOM', () => {
        const skipBtn = document.getElementById('skip-btn');
        expect(skipBtn).not.toBeNull();
    });

    describe('Keyboard Shortcuts', () => {
        beforeEach(() => {
            resetSubmitForTest();
            setupEvents();
        });

        it('submits custom input on Ctrl+Enter when text is present', () => {
            const customText = document.getElementById('custom-text') as HTMLTextAreaElement;
            customText.value = 'My custom answer';

            const event = new KeyboardEvent('keydown', {
                key: 'Enter',
                ctrlKey: true,
                bubbles: true
            });

            customText.dispatchEvent(event);

            expect(invoke).toHaveBeenCalledWith('on_submit', expect.objectContaining({
                result: expect.stringContaining('My custom answer')
            }));
        });

        it('submits custom input on Meta+Enter when text is present', () => {
            const customText = document.getElementById('custom-text') as HTMLTextAreaElement;
            customText.value = 'Mac custom answer';

            const event = new KeyboardEvent('keydown', {
                key: 'Enter',
                metaKey: true,
                bubbles: true
            });

            customText.dispatchEvent(event);

            expect(invoke).toHaveBeenCalledWith('on_submit', expect.objectContaining({
                result: expect.stringContaining('Mac custom answer')
            }));
        });

        it('does not submit on Ctrl+Enter if text is empty or whitespace', () => {
            const customText = document.getElementById('custom-text') as HTMLTextAreaElement;
            customText.value = '   ';

            const event = new KeyboardEvent('keydown', {
                key: 'Enter',
                ctrlKey: true,
                bubbles: true
            });

            customText.dispatchEvent(event);

            expect(invoke).not.toHaveBeenCalledWith('on_submit', expect.anything());
            expect(customText.classList.contains('shake')).toBe(true);
        });

        it('does not submit if only Enter is pressed without modifiers', () => {
            const customText = document.getElementById('custom-text') as HTMLTextAreaElement;
            customText.value = 'Regular enter press';

            const event = new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true
            });

            customText.dispatchEvent(event);

            expect(invoke).not.toHaveBeenCalledWith('on_submit', expect.anything());
        });
    });
});
