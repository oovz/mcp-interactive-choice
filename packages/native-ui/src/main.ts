import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';

interface InputData {
  title?: string;
  body?: string;
  choices?: string[];
  recommendedIndex?: number;
  allowCustom?: boolean;
}

interface Result {
  choice: string | null;
  index: number;
  custom_input: string | null;
}

if (typeof window !== 'undefined') {
  window.onerror = (msg, url, line, col, error) => {
    invoke('log_debug', { msg: `WINDOW ERROR: ${msg} at ${url}:${line}:${col}. Error object: ${JSON.stringify(error)}` });
    return false;
  };

  window.onunhandledrejection = (event) => {
    invoke('log_debug', { msg: `UNHANDLED REJECTION: ${event.reason}` });
  };
}

export async function initUI() {
  const titleEl = document.getElementById('title') as HTMLHeadingElement;
  const bodyEl = document.getElementById('body-markdown') as HTMLDivElement;
  const choicesEl = document.getElementById('choices-container') as HTMLDivElement;
  const customContainer = document.getElementById('custom-container') as HTMLElement;
  const customText = document.getElementById('custom-text') as HTMLTextAreaElement;
  const loadingEl = document.getElementById('loading') as HTMLDivElement;

  try {
    await invoke('log_debug', { msg: "Initializing UI..." });
    const inputJson: string = (await invoke('get_input')) || "{}";
    await invoke('log_debug', { msg: `Received input JSON: ${inputJson}` });

    const data: InputData = JSON.parse(inputJson);
    await invoke('log_debug', { msg: `Parsed input data: ${JSON.stringify(data)}` });

    if (data.title && titleEl) {
      titleEl.textContent = data.title;
    }
    if (data.body && bodyEl) {
      console.log("DEBUG: Parsing markdown body...");
      bodyEl.innerHTML = await marked.parse(data.body);
    }

    if (data.choices && Array.isArray(data.choices) && choicesEl) {
      choicesEl.innerHTML = '';
      data.choices.forEach((choice, index) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        if (data.recommendedIndex === index) {
          btn.classList.add('recommended');
          btn.innerHTML = `${choice} <span class="rec-label">Recommended</span>`;
        } else {
          btn.textContent = choice;
        }
        btn.onclick = () => submit(choice, index);
        choicesEl.appendChild(btn);
      });
    }

    if (data.allowCustom && customContainer) {
      customContainer.classList.remove('hidden');
      if (customText) {
        customText.focus();
      }
    }

    // Smooth transition for loading
    if (loadingEl) {
      loadingEl.style.opacity = '0';
      setTimeout(() => loadingEl.classList.add('hidden'), 300);
    }
    await invoke('log_debug', { msg: "UI initialization complete." });
  } catch (err) {
    console.error('Failed to init UI:', err);
    if (titleEl) titleEl.textContent = 'Error loading question details.';
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

let isSubmitting = false;

export function submit(choice: string | null, index: number) {
  if (isSubmitting) return;
  isSubmitting = true;

  // Visual feedback: Disable all buttons
  document.querySelectorAll('button').forEach(btn => btn.disabled = true);

  const result: Result = {
    choice,
    index,
    custom_input: null
  };
  invoke('on_submit', { result: JSON.stringify(result) });
}

export function submitCustom() {
  if (isSubmitting) return;

  const customText = document.getElementById('custom-text') as HTMLTextAreaElement;
  if (!customText) return;

  const val = customText.value.trim();
  if (!val) {
    customText.focus();
    return;
  }

  isSubmitting = true;
  document.querySelectorAll('button').forEach(btn => btn.disabled = true);

  const result: Result = {
    choice: null,
    index: -1,
    custom_input: val
  };
  invoke('on_submit', { result: JSON.stringify(result) });
}

// Only run automatically if not in a test environment
if (typeof window !== 'undefined' && !window.hasOwnProperty('__VITEST__')) {
  const start = () => {
    const submitCustomBtn = document.getElementById('submit-custom') as HTMLButtonElement;
    if (submitCustomBtn) {
      submitCustomBtn.onclick = submitCustom;
    }
    initUI();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
