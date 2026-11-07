const STANDALONE_LOCATORS_SCRIPT = `
    var AG_UI = {
        // Standalone has no quickpick history popup — these are no-ops for interface compatibility
        openHistoryPopup: () => "no-icon",
        clickShowMoreInPopup: () => {},
        closeHistoryPopup: () => {},
        // Announcement / tip cards ("Introducing Remote Agents", "Search Across
        // Conversations", ...) and the first-run "One last thing before getting
        // started" panel. Opt-in checkboxes there are left/turned OFF (no data
        // sharing, no newsletter) before Continue. Never touches error cards
        // ("Agent terminated due to error ... Dismiss / Retry").
        dismissTipCards: () => {
            let n = 0;
            const txt = (el) => (el && (el.innerText || el.textContent) || '');
            for (const b of Array.from(document.querySelectorAll('button'))) {
                const label = txt(b).trim();
                if (!/^(dismiss|kapat|got it|anladım)$/i.test(label)) continue;
                let card = b.parentElement;
                for (let i = 0; i < 4 && card && txt(card).length < 40; i++) card = card.parentElement;
                const body = txt(card);
                if (/error|terminated|retry|failed|hata/i.test(body)) continue;
                try { b.click(); n++; } catch (_) {}
            }
            const onboarding = Array.from(document.querySelectorAll('div, section')).find(el =>
                /one last thing before getting started/i.test(txt(el)) && el.querySelector('button')
                && txt(el).length < 3000
            );
            if (onboarding) {
                for (const cb of Array.from(onboarding.querySelectorAll('input[type="checkbox"]'))) {
                    if (cb.checked) { try { cb.click(); } catch (_) {} }
                }
                const cont = Array.from(onboarding.querySelectorAll('button')).find(x => /^(continue|devam)/i.test(txt(x).trim()));
                if (cont && !Array.from(onboarding.querySelectorAll('input[type="checkbox"]')).some(c => c.checked)) {
                    try { cont.click(); n++; } catch (_) {}
                }
            }
            return n;
        },
        dismissConsentModals: () => {
            try { AG_UI.dismissTipCards(); } catch (_) {}
            const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .modal'));
            const consentDialog = dialogs.find(d =>
                /security notice\\s*&\\s*data use|allow google to collect and use my interactions data/i.test(d.textContent || '')
            );
            if (!consentDialog) return false;
            const cb = consentDialog.querySelector('input[type="checkbox"]');
            if (cb && cb.checked) {
                cb.click();
            }
            const acceptBtn = Array.from(consentDialog.querySelectorAll('button')).find(b =>
                /accept and continue|kabul et/i.test((b.textContent || '').trim())
            );
            if (acceptBtn) {
                setTimeout(() => { try { acceptBtn.click(); } catch (_) {} }, 60);
                if (!cb || !cb.checked) {
                    try { acceptBtn.click(); } catch (_) {}
                }
            }
            return true;
        },
        checkForQuestion: () => {
            if (AG_UI.dismissConsentModals()) return null;
            const isVisible = (el) => {
                if (!el) return false;
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return false;
                const s = window.getComputedStyle(el);
                return s.display !== 'none' && s.visibility !== 'hidden';
            };
            const isExcluded = (el) => !!el.closest('.titlebar, .monaco-workbench .menubar, .monaco-workbench .statusbar, .monaco-workbench .activitybar, .monaco-editor, .editor-widget, .find-widget, .quick-input-widget, .monaco-menu-container, .context-view, .tabs-container, .monaco-action-bar, .actions-container');

            const allRadios = Array.from(document.querySelectorAll('[role="radio"], input[type="radio"]')).filter(el => isVisible(el) && !isExcluded(el));
            const allCheckboxes = Array.from(document.querySelectorAll('[role="checkbox"], input[type="checkbox"]')).filter(el => isVisible(el) && !isExcluded(el));
            const interactiveElements = [...allRadios, ...allCheckboxes];

            let container = null;
            if (interactiveElements.length > 0) {
                container = interactiveElements[0].closest('form, fieldset, [role="dialog"], .modal, [class*="rounded"], div.p-4, div.p-3, div.p-2, div.border') ||
                            interactiveElements[0].parentElement?.parentElement?.parentElement ||
                            interactiveElements[0].parentElement;
            }

            if (!container) {
                const allContainers = Array.from(document.querySelectorAll('.modal, [role="dialog"], .interactive-session, [data-testid*="interactive-modal"], [data-testid*="question"]')).filter(c => isVisible(c) && !isExcluded(c));
                container = allContainers[0] || null;
            }

            if (!container) {
                const allBtns = Array.from(document.querySelectorAll('button')).filter(b => isVisible(b) && !isExcluded(b));
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
            )).filter(el => isVisible(el) && !isExcluded(el));

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
                txt = txt.replace(/^[0-9]+[\\s.)\\-]+/, '').replace(/\\b\\(Recommended\\)\\b/gi, '').trim();
                if (txt && !txt.match(/^(Other|Other \\(write your answer\\)|Other \\(write in\\)|Diğer|Submit|Skip|Gönder|Atla|\\d+)$/i)) {
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
                        header = pTags.map(p => p.textContent.trim()).filter(Boolean).join('\\n');
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
            const editor = AG_UI.getChatInput();
            const card = editor?.closest('.bg-card, form, [class*="composer"], [class*="input-container"]') || editor?.parentElement?.parentElement?.parentElement?.parentElement || document;

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
            const btn = card.querySelector(selectors.join(', '));
            if (btn && AG_UI.isVisible(btn)) return btn;
            
            const stopIcon = card.querySelector(
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
                if (el.closest('nav, aside, [role="navigation"], button[class*="headerbtn"], [data-project-card], [class*="task"]')) return false;
                if (!AG_UI.isVisible(el)) return false;
                return true;
            });
        },

        getNewChatButton: () => {
            const isInvalidNewChatEl = (el) => {
                if (!el) return true;
                const href = el.getAttribute('href') || el.closest('a')?.getAttribute('href') || '';
                if (href.includes('/c/')) return true;
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                const testid = (el.getAttribute('data-testid') || '').toLowerCase();
                if (aria.includes('add context') || aria.includes('attach') || aria.includes('create new project') || testid.includes('add-project')) return true;
                if (el.closest('[data-testid="agent-input-box"], [id*="SidePanelInputBox"]')) return true;
                return false;
            };

            // 1. If currently inside a project section (?project=<id> or ?section=<id>), prefer the New Conversation button for that project
            try {
                const params = new URLSearchParams(window.location.search);
                const sectionId = params.get('project') || params.get('section');
                if (sectionId) {
                    const sectionBtn = document.querySelector(
                        'a[href="/?project=' + sectionId + '"], a[href*="project=' + sectionId + '"], a[href="/?section=' + sectionId + '"], a[href*="section=' + sectionId + '"]'
                    );
                    if (sectionBtn && !isInvalidNewChatEl(sectionBtn)) return sectionBtn;
                }
            } catch (e) {}

            // 2. Explicit New Conversation test IDs in Standalone 2.23+
            const explicitBtn = document.querySelector('[data-testid="new-conversation-button"], [data-testid="app-icon-new-conversation-button"], [data-testid="new-chat-button"]');
            if (explicitBtn && !isInvalidNewChatEl(explicitBtn)) return explicitBtn;

            // 3. Classic SVG path
            const svgPath = document.querySelector('path[d="M12 4.5v15m7.5-7.5h-15"]');
            if (svgPath) {
                const btn = svgPath.closest('button, a, [role="button"]');
                if (btn && !isInvalidNewChatEl(btn)) return btn;
            }
            
            // 4. Icon selectors (excluding input box, add-project buttons, and other projects' section/project links)
            const iconSelectors = 'svg.lucide-plus, svg.lucide-square-pen, svg.lucide-message-square-plus';
            const icons = Array.from(document.querySelectorAll(iconSelectors));
            for (const icon of icons) {
                const btn = icon.closest('button, a, [role="button"]');
                const href = (btn && btn.getAttribute('href')) || '';
                if (btn && !isInvalidNewChatEl(btn) && !href.includes('section=') && !href.includes('project=')) return btn;
            }
            
            // 5. Attribute selectors (excluding /c/ conversation links and other projects' section/project links)
            const selectors = [
                '[aria-label="New Conversation" i]',
                '[aria-label="New Chat" i]',
                '[aria-label="Yeni Sohbet" i]',
                '[title="New Conversation" i]',
                '[title="New Chat" i]',
                '[title="Yeni Sohbet" i]',
                '[class*="new-chat"]',
                '[data-tooltip-id*="new-conversation" i]'
            ];
            const attrBtns = Array.from(document.querySelectorAll(selectors.join(', '))).filter(b => {
                const href = b.getAttribute('href') || '';
                return !isInvalidNewChatEl(b) && !href.includes('section=') && !href.includes('project=');
            });
            if (attrBtns.length > 0) return attrBtns[0];
            
            const allBtns = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter(b => !isInvalidNewChatEl(b));
            return allBtns.find(b => {
                const text = (b.textContent || '').trim().toLowerCase();
                return text === 'new chat' || text === 'new conversation' || text === 'yeni sohbet';
            }) || null;
        },

        getModelSelectorButton: () => {
            const isFile = (str) => /\.(js|jsx|ts|tsx|md|json|py|html|css|txt|sh)$/i.test((str || '').trim());

            const explicit = Array.from(document.querySelectorAll(
                '[data-testid="model-selector-trigger"], [data-testid*="model-selector" i], [aria-label*="Select model" i], [title*="Select model" i], [aria-label*="选择模型" i], [title*="选择模型" i], [aria-label*="current:" i], [aria-label*="当前" i], [data-testid*="model-select" i]'
            ));

            const validExplicit = explicit.filter(el => {
                const text = (el.textContent || '').trim();
                const label = (el.getAttribute('aria-label') || '').trim();
                if (isFile(text) || isFile(label)) return false;
                return true;
            });

            // Prefer visible ones, but fallback to hidden ones (e.g., when ask_question modal hides the chat input container)
            const visibleExplicit = validExplicit.filter(AG_UI.isVisible);
            if (visibleExplicit.length > 0) return visibleExplicit[0];
            if (validExplicit.length > 0) return validExplicit[0];

            const modelKeywords = ['gemini', 'claude', 'gpt', 'opus', 'sonnet', 'flash', 'argon', 'llama', 'mistral', 'deepseek'];
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
            const modelKeywords = ['gemini', 'claude', 'gpt', 'opus', 'sonnet', 'flash', 'argon', 'llama', 'mistral', 'deepseek'];
            
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
                        '[data-testid="model-selector-item"], [data-testid="model-selector-effort-group"], [data-model-base], button, [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], .model-option, .main-row-trigger, [data-radix-collection-item], [data-radix-select-item]'
                    ));
                    candidates.push(...items);
                });
            } else {
                candidates = Array.from(document.querySelectorAll(
                    '[data-testid="model-selector-item"], [data-testid="model-selector-effort-group"], [data-model-base], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], .model-option, .main-row-trigger, [data-radix-collection-item], [data-radix-select-item]'
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
                '[data-testid="thinking-collapsible-trigger"]',
                '[data-testid="tool-group-collapsible"]',
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
