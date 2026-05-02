/**
 * UI Locators Module
 * 
 * Centralized registry for all DOM traversal and element querying logic.
 * This script is injected into the IDE via Chrome DevTools Protocol (CDP) 
 * prior to evaluating any bot actions.
 * 
 * By maintaining a single source of truth for all CSS selectors, the bot 
 * becomes highly resilient to IDE UI changes and avoids extracting data from 
 * hidden or stale DOM nodes.
 */

const UI_LOCATORS_SCRIPT = `
    var AG_UI = {
        /**
         * Retrieves the currently active and visible chat container.
         * 
         * Strategy: Anchor from the active chat input element (which the IDE
         * always places inside the currently focused conversation) and walk
         * up the DOM tree to the nearest #conversation ancestor. This
         * guarantees we never accidentally select a stale or background
         * thread that the IDE keeps mounted in the DOM.
         * 
         * Fallback: If the input-based approach fails (e.g. input not yet
         * rendered), we fall back to querying all candidate containers and
         * selecting the first one whose entire ancestor chain is visible
         * (no display:none parents).
         * 
         * @returns {HTMLElement|null} The active conversation element
         */
        getVisibleChatContainer: () => {
            // --- Primary strategy: anchor from the active chat input ---
            const input = AG_UI.getChatInput();
            if (input) {
                let el = input;
                while (el) {
                    if (el.id === 'conversation' || el.classList.contains('interactive-session')) {
                        return el;
                    }
                    el = el.parentElement;
                }
            }

            // --- Fallback: query all candidates and pick the first visible one ---
            const containers = Array.from(document.querySelectorAll('#conversation, .flex.w-full.grow.flex-col.overflow-hidden, #chat, .interactive-session'));
            return containers.find(c => {
                let isVisible = true;
                let el = c;
                while (el) {
                    if (window.getComputedStyle(el).display === 'none') {
                        isVisible = false;
                        break;
                    }
                    el = el.parentElement;
                }
                return isVisible;
            }) || containers[0] || null;
        },

        /**
         * Retrieves the main text area editor used to insert prompts.
         * Excludes xterm inputs to avoid typing into the terminal.
         * @returns {HTMLTextAreaElement|HTMLElement|null} The active editor
         */
        getChatInput: () => {
            const editors = [...document.querySelectorAll('.interactive-input-editor textarea, #conversation textarea, #chat textarea, .chat-input textarea, [aria-label*="chat input" i] textarea, [contenteditable="true"]')]
                .filter(el => !el.className.includes('xterm'));
            return editors.at(-1) || null;
        },

        /**
         * Retrieves the stop/cancel button when the agent is generating.
         * @returns {HTMLElement|null} The stop button
         */
        getStopButton: () => {
            const chatArea = AG_UI.getVisibleChatContainer() || document;
            const stopIcon = chatArea.querySelector("svg.lucide-square, [data-tooltip-id*='cancel'], [aria-label*='Stop'], [title*='Stop'], [aria-label*='Cancel']");
            if (stopIcon) return stopIcon.closest('button') || stopIcon;
            
            const allBtns = Array.from(chatArea.querySelectorAll('button'));
            return allBtns.find(b => {
                const svg = b.querySelector('svg');
                return svg && (svg.classList.contains('lucide-square') || b.innerHTML.includes('square'));
            }) || null;
        },

        /**
         * Checks if there are active loading spinners on the page.
         * Intelligently ignores tiny/hidden status indicator spinners.
         * @returns {boolean} True if generating/loading
         */
        isLoading: () => {
            return Array.from(document.querySelectorAll('.codicon-loading, .loading, [class*="animate-spin"], [class*="spinner"], [class*="loader"]')).some(el => {
                if (el.offsetParent === null) return false;
                if (el.className.includes('h-3') && el.className.includes('w-3')) return false;
                const parent = el.parentElement;
                if (parent && (parent.className.includes('opacity-') || parent.className.includes('hidden'))) return false;
                return true;
            });
        },

        /**
         * Retrieves the 'New Chat' button from the sidebar or header.
         * @returns {HTMLElement|null}
         */
        getNewChatButton: () => {
            const svgPath = document.querySelector('path[d="M12 4.5v15m7.5-7.5h-15"]');
            if (svgPath) {
                const btn = svgPath.closest('button, a, [role="button"]');
                if (btn) return btn;
            }
            return document.querySelector('[aria-label*="New Chat" i], [title*="New Chat" i], [aria-label*="Yeni Sohbet" i], [class*="new-chat"], [aria-label*="New Task" i], [title*="New Task" i], [data-tooltip-id*="new-conversation" i]') || null;
        },

        /**
         * Retrieves the model selector dropdown button.
         * @returns {HTMLElement|null}
         */
        getModelSelectorButton: () => {
            return document.querySelector('[aria-label*="Select model" i], [title*="Select model" i], [aria-label*="model" i]') || null;
        },

        /**
         * Retrieves the list of available model options when the selector is open.
         * @returns {HTMLElement[]}
         */
        getModelOptions: () => {
            // Model dropdown items are plain buttons with a specific layout class.
            // They contain model names like "Gemini 3.1 Pro (High)", "Claude Opus 4.6 (Thinking)", etc.
            const modelKeywords = ['gemini', 'claude', 'gpt', 'opus', 'sonnet', 'flash'];
            const candidates = Array.from(document.querySelectorAll('button.px-2.py-1, [role="option"], [role="menuitemradio"]'));
            // Filter to only those containing model-related text
            return candidates.filter(el => {
                const text = (el.textContent || '').toLowerCase();
                return modelKeywords.some(k => text.includes(k));
            });
        },

        /**
         * Retrieves all workspace cards from the sidebar.
         * @returns {HTMLElement[]}
         */
        getWorkspaceCards: () => {
            return Array.from(document.querySelectorAll('div[data-workspace-card="true"]'));
        },

        /**
         * Retrieves chat thread pills (conversations) either globally or within a specific workspace card.
         * @param {HTMLElement} [container=document] The container to search within
         * @returns {HTMLElement[]}
         */
        getChatThreadPills: (container = document) => {
            return Array.from(container.querySelectorAll('[data-testid^="convo-pill-"]'));
        },
        
        /**
         * Removes "Thought for Xs" blocks from a cloned DOM element.
         * Useful for message extraction to prevent fetching internal logic.
         * @param {HTMLElement} clone The cloned message node
         */
        removeThoughtBlocks: (clone) => {
            const btns = Array.from(clone.querySelectorAll('button')).filter(b => b.innerText && b.innerText.includes('Thought for'));
            btns.forEach(btn => {
                if (btn.parentElement) btn.parentElement.remove();
            });
        }
    };
`;

module.exports = { UI_LOCATORS_SCRIPT };
