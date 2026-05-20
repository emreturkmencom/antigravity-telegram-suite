/**
 * UI Locators Module
 * 
 * Centralized registry for all DOM traversal and element querying logic.
 * This script is injected into the IDE or Standalone Agent UI via Chrome DevTools Protocol (CDP) 
 * prior to evaluating any bot actions.
 * 
 * Adaptive design: Automatically detects the environment (Standalone Agent App vs. Classic IDE)
 * and resolves selectors accordingly to ensure absolute resilience.
 */

const UI_LOCATORS_SCRIPT = `
    var AG_UI = {
        /**
         * Detects if the current environment is the classic VSCode-based IDE
         * vs the modern Standalone Agent Application.
         * @returns {boolean}
         */
        isClassicIDE: () => {
            return !!(document.querySelector('.monaco-workbench') || document.querySelector('[class*="monaco-"]'));
        },

        /**
         * Retrieves the currently active and visible chat container.
         * @returns {HTMLElement|null} The active conversation element
         */
        getVisibleChatContainer: () => {
            // --- Primary strategy: anchor from the active chat input ---
            const input = AG_UI.getChatInput();
            if (input) {
                let el = input;
                while (el) {
                    if (el.id === 'conversation' || 
                        el.classList.contains('interactive-session') || 
                        el.classList.contains('chat-container') ||
                        el.id === 'chat') {
                        return el;
                    }
                    el = el.parentElement;
                }
            }

            // --- Fallback: query all candidate containers and pick the first visible one ---
            const candidates = [
                '#conversation', 
                '.interactive-session',
                '.chat-container',
                '#chat',
                '.flex.w-full.grow.flex-col.overflow-hidden'
            ];
            
            const containers = Array.from(document.querySelectorAll(candidates.join(', ')));
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
         * Retrieves the main text area/input used to insert prompts.
         * Excludes xterm inputs to avoid typing into the terminal.
         * @returns {HTMLTextAreaElement|HTMLElement|null} The active editor
         */
        getChatInput: () => {
            const isClassic = AG_UI.isClassicIDE();
            
            // Candidate selectors for inputs and editable elements
            const candidates = [
                '.interactive-input-editor textarea',
                '#conversation textarea',
                '#chat textarea',
                '.chat-input textarea',
                '.chat-input [contenteditable="true"]',
                '[aria-label*="chat input" i] textarea',
                '[aria-label*="chat input" i] [contenteditable="true"]',
                '[placeholder*="Ask" i] textarea',
                '[placeholder*="Ask" i] [contenteditable="true"]',
                '[placeholder*="Sohbet" i] textarea',
                '[placeholder*="Sohbet" i] [contenteditable="true"]',
                'textarea',
                '[contenteditable="true"]'
            ];

            const editors = [...document.querySelectorAll(candidates.join(', '))]
                .filter(el => {
                    // Filter out xterm, hidden elements, or display none
                    if (el.className && typeof el.className === 'string' && el.className.includes('xterm')) return false;
                    if (el.offsetParent === null) return false;
                    if (window.getComputedStyle(el).display === 'none') return false;
                    return true;
                });

            // Return the most relevant editor (preferring the last active one)
            return editors.at(-1) || null;
        },

        /**
         * Retrieves the stop/cancel button when the agent is generating.
         * @returns {HTMLElement|null} The stop button
         */
        getStopButton: () => {
            const chatArea = AG_UI.getVisibleChatContainer() || document;
            
            // Search by common stop/cancel icons and attributes
            const stopIcon = chatArea.querySelector(
                "svg.lucide-square, [data-tooltip-id*='cancel'], [aria-label*='Stop'], [title*='Stop'], [aria-label*='Cancel'], [aria-label*='Durdur'], [title*='Durdur']"
            );
            if (stopIcon) return stopIcon.closest('button') || stopIcon;
            
            // Secondary strategy: find any button containing a square shape or 'stop' text
            const allBtns = Array.from(chatArea.querySelectorAll('button'));
            return allBtns.find(b => {
                const svg = b.querySelector('svg');
                const text = (b.textContent || '').toLowerCase();
                return (svg && (svg.classList.contains('lucide-square') || b.innerHTML.includes('square'))) ||
                       text.includes('stop') || 
                       text.includes('cancel') || 
                       text.includes('durdur');
            }) || null;
        },

        /**
         * Checks if there are active loading spinners on the page.
         * Intelligently ignores tiny/hidden status indicator spinners.
         * @returns {boolean} True if generating/loading
         */
        isLoading: () => {
            const selectors = [
                '.codicon-loading', 
                '.loading', 
                '[class*="animate-spin"]', 
                '[class*="spinner"]', 
                '[class*="loader"]',
                '.thinking-indicator'
            ];
            
            return Array.from(document.querySelectorAll(selectors.join(', '))).some(el => {
                if (el.offsetParent === null) return false;
                // Ignore tiny status bar indicators
                if (el.className && typeof el.className === 'string') {
                    if (el.className.includes('h-3') && el.className.includes('w-3')) return false;
                }
                const parent = el.parentElement;
                if (parent && parent.className && typeof parent.className === 'string') {
                    if (parent.className.includes('opacity-') || parent.className.includes('hidden')) return false;
                }
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
            
            // Universal label query for new conversation trigger
            const selectors = [
                '[aria-label*="New Chat" i]',
                '[title*="New Chat" i]',
                '[aria-label*="Yeni Sohbet" i]',
                '[title*="Yeni Sohbet" i]',
                '[class*="new-chat"]',
                '[aria-label*="New Task" i]',
                '[title*="New Task" i]',
                '[data-tooltip-id*="new-conversation" i]'
            ];
            return document.querySelector(selectors.join(', ')) || null;
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
            const modelKeywords = ['gemini', 'claude', 'gpt', 'opus', 'sonnet', 'flash'];
            const candidates = Array.from(document.querySelectorAll('button.px-2.py-1, [role="option"], [role="menuitemradio"], .model-option'));
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
            return Array.from(document.querySelectorAll('div[data-workspace-card="true"], .workspace-card'));
        },

        /**
         * Retrieves chat thread pills (conversations) either globally or within a specific workspace card.
         * @param {HTMLElement} [container=document] The container to search within
         * @returns {HTMLElement[]}
         */
        getChatThreadPills: (container = document) => {
            return Array.from(container.querySelectorAll('[data-testid^="convo-pill-"], .convo-pill, [class*="conversation-pill"]'));
        },
        
        /**
         * Removes "Thought for Xs" blocks and tool execution blocks from a cloned DOM element.
         * @param {HTMLElement} clone The cloned message node
         */
        removeThoughtBlocks: (clone) => {
            const btns = Array.from(clone.querySelectorAll('button')).filter(b => b.innerText && b.innerText.includes('Thought for'));
            btns.forEach(btn => {
                if (btn.parentElement) btn.parentElement.remove();
            });
            // Support modern 2.0 thought/thinking blocks
            const modernThoughts = Array.from(clone.querySelectorAll('.thought-block, [class*="thought-"], details.thought'));
            modernThoughts.forEach(el => el.remove());
            // Remove IDE 2.0 tool execution blocks
            const toolBlocks = Array.from(clone.querySelectorAll('[class*="group/run-command"], [class*="group/file-change"], [class*="group/tool-"], [class*="group/edit-file"]'));
            toolBlocks.forEach(el => el.remove());
        }
    };
`;

module.exports = { UI_LOCATORS_SCRIPT };
