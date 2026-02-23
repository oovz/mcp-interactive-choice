import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { marked } from 'marked';

interface InputData {
  title?: string;
  body?: string;
  choices?: string[];
  recommendedIndex?: number;
}

interface Result {
  choice: string | null;
  index: number;
  custom_input: string | null;
  skipped?: boolean;
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

/**
 * Resize the Tauri window to fit the rendered content.
 * Measures individual sections since body height is constrained to 100%.
 */
async function fitWindowToContent() {
  try {
    const width = 480;

    // Measure actual content: titlebar + main content + footer + body border (1px * 2)
    const titlebar = document.querySelector('.titlebar') as HTMLElement;
    const appContainer = document.querySelector('.app-container') as HTMLElement;
    const footer = document.querySelector('footer') as HTMLElement;

    const titlebarH = titlebar ? titlebar.offsetHeight : 0;
    const contentH = appContainer ? appContainer.scrollHeight : 0;
    const footerH = footer ? footer.offsetHeight : 0;
    const borderH = 2; // body border: 1px top + 1px bottom

    const totalHeight = titlebarH + contentH + footerH + borderH;
    // Clamp between 200 and 700 to avoid extreme sizes
    const height = Math.min(700, Math.max(200, totalHeight));

    const appWindow = getCurrentWindow();
    await appWindow.setSize(new LogicalSize(width, height));
    await appWindow.center();
  } catch (err) {
    // Silently ignore — may fail in dev browser or tests
    console.warn('Could not auto-resize window:', err);
  }
}

/**
 * Show the animated success state after submit.
 */
function showSuccessState(container: HTMLElement, message: string) {
  const footer = document.querySelector('footer');
  if (footer) {
    footer.style.display = 'none';
  }

  container.innerHTML = `
    <div class="success-state">
      <div class="success-icon">
        <svg viewBox="0 0 24 24"><polyline points="6 12 10 16 18 8"/></svg>
      </div>
      <div class="success-text">${message}</div>
      <div class="success-sub">Window will close automatically</div>
    </div>
  `;
}

export async function initUI() {
  const titleEl = document.getElementById('title') as HTMLHeadingElement;
  const bodyEl = document.getElementById('body-markdown') as HTMLDivElement;
  const bodyContainer = document.getElementById('body-container') as HTMLElement;
  const choicesEl = document.getElementById('choices-container') as HTMLDivElement;
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
      bodyEl.innerHTML = await marked.parse(data.body);
    } else if (bodyContainer) {
      bodyContainer.classList.add('hidden');
    }

    if (data.choices && Array.isArray(data.choices) && choicesEl) {
      choicesEl.innerHTML = '';
      data.choices.forEach((choice, index) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';

        const textSpan = document.createElement('span');
        textSpan.className = 'choice-text';

        if (data.recommendedIndex === index) {
          btn.classList.add('recommended');
          textSpan.textContent = choice;
          const recLabel = document.createElement('span');
          recLabel.className = 'rec-label';
          recLabel.textContent = 'Recommended';
          btn.appendChild(textSpan);
          btn.appendChild(recLabel);
        } else {
          textSpan.textContent = choice;
          btn.appendChild(textSpan);
        }

        btn.addEventListener('click', () => {
          submit(choice, index);
        });

        choicesEl.appendChild(btn);
      });
    }

    // Smooth loading dismiss
    if (loadingEl) {
      loadingEl.classList.add('fade-out');
      setTimeout(() => loadingEl.classList.add('hidden'), 350);
    }

    // Resize window to fit content
    await fitWindowToContent();

    await invoke('log_debug', { msg: "UI initialization complete." });
  } catch (err) {
    console.error('Failed to init UI:', err);
    if (titleEl) titleEl.textContent = 'Error loading question details.';
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

let isSubmitting = false;

// purely for test isolation
export function resetSubmitForTest() {
  isSubmitting = false;
}

export function submit(choice: string | null, index: number) {
  if (isSubmitting) return;
  isSubmitting = true;

  // Visual feedback: mark selected button, fade others
  const choicesContainer = document.getElementById('choices-container');
  if (choicesContainer) {
    choicesContainer.classList.add('has-selection');
    const buttons = choicesContainer.querySelectorAll('.choice-btn');
    buttons.forEach((btn, i) => {
      if (i === index) {
        btn.classList.add('selected');
      }
      (btn as HTMLButtonElement).disabled = true;
    });
  }

  // Disable other interactive elements
  const customBtn = document.getElementById('submit-custom') as HTMLButtonElement;
  const skipBtn = document.getElementById('skip-btn') as HTMLButtonElement;
  const customText = document.getElementById('custom-text') as HTMLTextAreaElement;
  if (customBtn) customBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;
  if (customText) customText.disabled = true;

  // Show success state after a brief pause
  setTimeout(() => {
    const appContainer = document.querySelector('.app-container') as HTMLElement;
    if (appContainer) {
      showSuccessState(appContainer, 'Response sent');
    }
  }, 350);

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
    customText.classList.add('shake');
    customText.addEventListener('animationend', () => {
      customText.classList.remove('shake');
    }, { once: true });
    customText.focus();
    return;
  }

  isSubmitting = true;

  document.querySelectorAll('button').forEach(btn => btn.disabled = true);
  customText.disabled = true;

  setTimeout(() => {
    const appContainer = document.querySelector('.app-container') as HTMLElement;
    if (appContainer) {
      showSuccessState(appContainer, 'Custom response sent');
    }
  }, 250);

  const result: Result = {
    choice: null,
    index: -1,
    custom_input: val
  };
  invoke('on_submit', { result: JSON.stringify(result) });
}

export function submitSkip() {
  if (isSubmitting) return;
  isSubmitting = true;

  document.querySelectorAll('button').forEach(btn => btn.disabled = true);
  const customText = document.getElementById('custom-text') as HTMLTextAreaElement;
  if (customText) customText.disabled = true;

  setTimeout(() => {
    const appContainer = document.querySelector('.app-container') as HTMLElement;
    if (appContainer) {
      showSuccessState(appContainer, 'Question skipped');
    }
  }, 200);

  const result: Result = {
    choice: null,
    index: -1,
    custom_input: null,
    skipped: true
  };
  invoke('on_submit', { result: JSON.stringify(result) });
}

export function setupEvents() {
  const submitCustomBtn = document.getElementById('submit-custom') as HTMLButtonElement;
  if (submitCustomBtn) {
    submitCustomBtn.onclick = submitCustom;
  }

  const customText = document.getElementById('custom-text') as HTMLTextAreaElement;
  if (customText) {
    customText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitCustom();
      }
    });
  }

  const skipBtn = document.getElementById('skip-btn') as HTMLButtonElement;
  if (skipBtn) {
    skipBtn.onclick = submitSkip;
  }

  // Wire up custom title bar close button
  const closeBtn = document.getElementById('titlebar-close') as HTMLButtonElement;
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      try {
        await invoke('on_submit', {
          result: JSON.stringify({
            choice: null,
            index: -1,
            custom_input: null
          })
        });
      } catch {
        // Window may close before promise resolves
      }
    });
  }
}

// Only run automatically if not in a test environment
if (typeof window !== 'undefined' && !window.hasOwnProperty('__VITEST__')) {
  const start = () => {
    setupEvents();
    initUI();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
