const STANDALONE_LOCATORS_SCRIPT = `
    var AG_UI = {
        // Standalone has no quickpick history popup — these are no-ops for interface compatibility
        openHistoryPopup: () => "no-icon",
        clickShowMoreInPopup: () => {},
        closeHistoryPopup: () => {},
        checkForQuestion: () => {
            const isVisible = (el) => {
                if (!el) return false;
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return false;
                const s = window.getComputedStyle(el);
                return s.display !== 'none' && s.visibility !== 'hidden';
            };
            const isMonaco = (el) => !!el.closest('.monaco-editor, .editor-widget, .find-widget');

            const allRadios = Array.from(document.querySelectorAll('[role="radio"], input[type="radio"]')).filter(el => isVisible(el) && !isMonaco(el));
            const allCheckboxes = Array.from(document.querySelectorAll('[role="checkbox"], input[type="checkbox"]')).filter(el => isVisible(el) && !isMonaco(el));
            const interactiveElements = [...allRadios, ...allCheckboxes];

            let container = null;
            if (interactiveElements.length > 0) {
                container = interactiveElements[0].closest('form, fieldset, [role="dialog"], .modal, [class*="rounded"], div.p-4, div.p-3, div.p-2, div.border') ||
                            interactiveElements[0].parentElement?.parentElement?.parentElement ||
                            interactiveElements[0].parentElement;
            }

            if (!container) {
                const allContainers = Array.from(document.querySelectorAll('.modal, [role="dialog"], .interactive-session, [data-testid*="interactive-modal"], [data-testid*="question"]')).filter(c => isVisible(c) && !isMonaco(c));
                container = allContainers[0] || null;
            }

            if (!container) {
                const allBtns = Array.from(document.querySelectorAll('button')).filter(b => isVisible(b) && !isMonaco(b));
                const submitBtn = allBtns.find(b => {
                    const t = (b.textContent || '').trim().toLowerCase();
                    return t.includes('submit') || t.includes('gönder') || t.includes('skip') || t.includes('atla') || t.includes('proceed') || t.includes('onayla');
                });
                if (submitBtn) {
                    container = submitBtn.closest('form, fieldset, [class*="rounded"], div.p-4, div.p-3, div.border') || submitBtn.parentElement?.parentElement;
                }
            }

            if (!container) return null;

            const isModal = interactiveElements.length > 0 || !!container.querySelector('textarea, input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], select, button');
            if (!isModal) return null;
            
            let headerEl = container.querySelector('.modal-header, [data-testid*="interactive-modal"] h2, [data-testid*="modal"] h2, h2, h3.font-medium, h3, h4, fieldset legend, .font-semibold, .font-medium');
            let header = (headerEl && headerEl.textContent.trim());
            
            const optionCandidateEls = Array.from(container.querySelectorAll(
                'label, [role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"], [data-testid*="option"], div[class*="cursor-pointer"], li'
            )).filter(el => isVisible(el) && !isMonaco(el));

            let options = [];
            for (const el of (interactiveElements.length > 0 ? interactiveElements : optionCandidateEls)) {
                let txt = (el.innerText || el.textContent || '').trim();
                if (!txt || txt.length <= 2) {
                    const row = el.closest('label, div.flex, li, [role="button"]') || el.parentElement;
                    txt = (row?.innerText || row?.textContent || '').trim();
                }
                if (!txt) {
                    txt = el.getAttribute('aria-label') || el.getAttribute('value') || '';
                }
                txt = txt.replace(/^[0-9]+[\s.)\-]+/, '').replace(/\b\(Recommended\)\b/gi, '').trim();
                if (txt && !txt.match(/^(Other|Other \(write your answer\)|Other \(write in\)|Diğer|Submit|Skip|Gönder|Atla|\d+)$/i)) {
                    if (!options.includes(txt)) options.push(txt);
                }
            }
            options = [...new Set(options)];
            
            const writeInEl = container.querySelector('textarea:not([disabled]), input[type="text"]:not([disabled])');
            const hasWriteIn = !!writeInEl;
            
            if (options.length === 0 && !hasWriteIn) {
                if (!header) {
                    const pTags = Array.from(container.querySelectorAll('p, .text-sm, .text-base')).filter(isVisible);
                    if (pTags.length > 0) {
                        header = pTags.map(p => p.textContent.trim()).filter(Boolean).join('\n');
                    }
                }
                if (!header) return null;
            }
            
            return { header, options, hasWriteIn };
        },

        isClassicIDE: () => false,

        getVisibleChatContainer: () => {
            const chatList = document.querySelector('.relative.flex.flex-col.gap-y-3, .relative.flex.flex-col.gap-y-3.px-4, .chat-messages');
            if (chatList) return chatList;
            const standaloneContainer = document.querySelector('.theme-standalone') || document.getElementById('root') || document.body;
            return standaloneContainer;
        },

        getChatInput: () => {
            const candidates = [
                '[aria-label*="message input" i] textarea',
                '[aria-label*="message input" i] [contenteditable="true"]',
                '[aria-label*="message input" i]',
                'textarea',
                '[contenteditable="true"]'
            ];

            const editors = [...document.querySelectorAll(candidates.join(', '))]
                .filter(el => AG_UI.isVisible(el));

            return editors.at(-1) || null;
        },

        getStopButton: () => {
            const selectors = [
                'button[aria-label*="Cancel" i]',
                'button[aria-label*="Stop" i]',
                'button[title*="Cancel" i]',
                'button[title*="Stop" i]',
                'button[aria-label*="Durdur" i]',
                'button[aria-label*="İptal" i]',
                'button[data-tooltip-id*="cancel" i]',
                'button[data-tooltip-id*="stop" i]'
            ];
            const btn = document.querySelector(selectors.join(', '));
            if (btn && AG_UI.isVisible(btn)) return btn;
            
            const stopIcon = document.querySelector(
                "svg.lucide-square, svg.lucide-circle-stop, [data-tooltip-id*='cancel'], [aria-label*='Stop']"
            );
            if (stopIcon) return stopIcon.closest('button') || stopIcon;
            return null;
        },

        isLoading: () => {
            const chatArea = document.querySelector('.relative.flex.flex-col.gap-y-3') || document.querySelector('.chat-messages') || document.querySelector('.theme-standalone main') || document;
            const selectors = [
                '.loading', 
                '.thinking-indicator',
                '[class*="animate-spin"]',
                '[class*="spinner"]', 
                '[class*="loader"]'
            ];
            
            return Array.from(chatArea.querySelectorAll(selectors.join(', '))).some(el => {
                if (el.closest('nav, aside, [role="navigation"], button[class*="headerbtn"], [data-project-card]')) return false;
                if (!AG_UI.isVisible(el)) return false;
                return true;
            });
        },

        getNewChatButton: () => {
            const svgPath = document.querySelector('path[d="M12 4.5v15m7.5-7.5h-15"]');
            if (svgPath) {
                const btn = svgPath.closest('button, a, [role="button"]');
                if (btn) return btn;
            }
            
            const iconSelectors = 'svg.lucide-plus, svg.lucide-square-pen, svg.lucide-message-square-plus';
            const icon = document.querySelector(iconSelectors);
            if (icon) {
                const btn = icon.closest('button, a, [role="button"]');
                if (btn) return btn;
            }
            
            const selectors = [
                '[aria-label*="New Chat" i]',
                '[title*="New Chat" i]',
                '[aria-label*="Yeni Sohbet" i]',
                '[title*="Yeni Sohbet" i]',
                '[aria-label*="New Conversation" i]',
                '[title*="New Conversation" i]',
                '[class*="new-chat"]',
                '[aria-label*="New Task" i]',
                '[title*="New Task" i]',
                '[data-tooltip-id*="new-conversation" i]'
            ];
            let btn = document.querySelector(selectors.join(', '));
            if (btn) return btn;
            
            const allBtns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
            return allBtns.find(b => {
                const text = (b.textContent || '').trim().toLowerCase();
                return text === 'new chat' || text === 'new conversation' || text === 'yeni sohbet';
            }) || null;
        },

        getModelSelectorButton: () => {
            const isFile = (str) => /\.(js|jsx|ts|tsx|md|json|py|html|css|txt|sh)$/i.test((str || '').trim());

            const explicit = Array.from(document.querySelectorAll(
                '[data-testid="model-selector-trigger"], [data-testid*="model-selector" i], [aria-label*="Select model" i], [title*="Select model" i], [aria-label*="选择模型" i], [title*="选择模型" i], [aria-label*="current:" i], [aria-label*="当前" i], [data-testid*="model-select" i]'
            )).filter(AG_UI.isVisible);

            const validExplicit = explicit.filter(el => {
                const text = (el.textContent || '').trim();
                const label = (el.getAttribute('aria-label') || '').trim();
                if (isFile(text) || isFile(label)) return false;
                return true;
            });

            if (validExplicit.length > 0) return validExplicit[0];

            const modelKeywords = ['gemini', 'claude', 'gpt', 'opus', 'sonnet', 'flash', 'llama', 'mistral', 'deepseek'];
            const allButtons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(el => {
                if (!AG_UI.isVisible(el)) return false;
                const inMenu = el.closest('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], div[class*="popover"], div[class*="dropdown-content"]');
                if (inMenu) return false;
                
                const text = (el.textContent || '').trim();
                const label = (el.getAttribute('aria-label') || '').trim();
                if (isFile(text) || isFile(label)) return false;
                return true;
            });

            return allButtons.find(el => {
                const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.textContent || '')).toLowerCase();
                return label.includes('选择模型') ||
                    label.includes('select model') ||
                    label.includes('current:') ||
                    modelKeywords.some(k => label.includes(k));
            }) || null;
        },

        getModelOptions: () => {
            const isFile = (str) => /\.(js|jsx|ts|tsx|md|json|py|html|css|txt|sh)$/i.test((str || '').trim());
            const modelKeywords = ['gemini', 'claude', 'gpt', 'opus', 'sonnet', 'flash', 'llama', 'mistral', 'deepseek'];
            
            const selectorBtn = AG_UI.getModelSelectorButton();
            const ariaControlsId = selectorBtn ? selectorBtn.getAttribute('aria-controls') : null;
            const controlledContainer = ariaControlsId ? document.getElementById(ariaControlsId) : null;

            const menuContainers = Array.from(document.querySelectorAll(
                '[data-testid="model-selector-panel"], [role="menu"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper], div[class*="popover"], div[class*="dropdown-content"], div[class*="select-content"], div[class*="menu"], div[class*="animate-slideIn"]'
            )).filter(AG_UI.isVisible);

            if (controlledContainer && AG_UI.isVisible(controlledContainer) && !menuContainers.includes(controlledContainer)) {
                menuContainers.push(controlledContainer);
            }

            let candidates = [];
            if (menuContainers.length > 0) {
                menuContainers.forEach(container => {
                    const items = Array.from(container.querySelectorAll(
                        '[data-testid="model-selector-item"], [data-model-base], button, [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], .model-option, .main-row-trigger, [data-radix-collection-item], [data-radix-select-item]'
                    ));
                    candidates.push(...items);
                });
            } else {
                candidates = Array.from(document.querySelectorAll(
                    '[data-testid="model-selector-item"], [data-model-base], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], .model-option, .main-row-trigger, [data-radix-collection-item], [data-radix-select-item]'
                ));
            }

            return candidates.filter(el => {
                if (!AG_UI.isVisible(el)) return false;
                const text = (el.textContent || '').trim();
                const label = (el.getAttribute('aria-label') || '').trim();
                const baseAttr = el.querySelector('[data-model-base]')?.getAttribute('data-model-base') || el.getAttribute('data-model-base') || '';
                const labelAttr = el.getAttribute('data-model-label') || '';
                
                if (isFile(text) || isFile(label)) return false;
                
                if (text.length < 3 || text.length > 100) return false;
                
                const lower = (text + ' ' + label + ' ' + baseAttr + ' ' + labelAttr).toLowerCase();
                return modelKeywords.some(k => lower.includes(k));
            });
        },

        getWorkspaceCards: () => {
            return Array.from(document.querySelectorAll('button[class*="headerbtn"], div[data-project-card="true"], div[data-workspace-card="true"], .workspace-card'));
        },

        getChatThreadPills: (container = document) => {
            return Array.from(container.querySelectorAll('a[href*="/c/"], [data-testid^="convo-pill-"], .convo-pill, [class*="conversation-pill"]'));
        },
        
        isVisible: (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length > 0));
        },

        removeThoughtBlocks: (clone) => {
            const thoughtSelectors = [
                'button[data-testid*="worked-for"]',
                '[data-testid="worked-for-collapsible"]',
                'button[class*="worked-for"]',
                '.thought-block',
                '[class*="thought-"]',
                'details.thought',
                'thought',
                '[class*="group/run-command"]',
                '[class*="group/tool-"]',
                '[class*="group/file-change"]',
                '[class*="group/edit-file"]'
            ];
            Array.from(clone.querySelectorAll(thoughtSelectors.join(', '))).forEach(el => {
                const next = el.nextElementSibling;
                if (next && (next.classList.contains('relative') || next.querySelector('.overflow-y-auto'))) {
                    next.remove();
                }
                el.remove();
            });
            Array.from(clone.querySelectorAll('button')).forEach(b => {
                const txt = (b.innerText || b.textContent || '').trim();
                if (/^(Thought|Worked|Ran|Explored|Planning|Thinking|Working|Running)\\b/i.test(txt)) {
                    const next = b.nextElementSibling;
                    if (next && (next.classList.contains('relative') || next.querySelector('.overflow-y-auto'))) {
                        next.remove();
                    }
                    b.remove();
                }
            });
        }
    };
`;

module.exports = { STANDALONE_LOCATORS_SCRIPT };
