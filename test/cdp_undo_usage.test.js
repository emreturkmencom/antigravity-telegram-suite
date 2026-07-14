const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'cdp_controller.js'), 'utf8');

assert(source.includes('async function captureUndoAnchor'));
assert(source.includes('async function undoToAnchor'));
assert(source.includes('undo_anchor_not_found'));
assert(!source.includes("document.execCommand('undo')"));

const undoToAnchorSource = source.slice(
    source.indexOf('async function undoToAnchor'),
    source.indexOf('module.exports =')
);
assert(
    undoToAnchorSource.includes("evaluateUndoLocator(port, targetId, text, 'undo', normalized)")
        && undoToAnchorSource.includes('await confirmUndoDialog({')
        && !undoToAnchorSource.includes('normalized.matchIndex ='),
    'Undo must locate the exact anchor and complete the GUI confirmation without inventing an ordinal'
);
assert(
    source.includes("const { confirmUndoDialog } = require('./undo_confirmation');"),
    'CDP Undo must use the focused GUI confirmation state machine'
);

assert(
    source.includes("threadIdSource = 'url';")
        && source.includes("threadIdSource = 'dom';")
        && source.includes("threadIdSource = 'title_lookup';")
        && source.includes("threadIdSource = 'filesystem';")
        && source.includes("workspaceSource = 'dom';")
        && source.includes("workspaceSource = 'document_title';")
        && source.includes('workspaceSource'),
    'active-thread metadata must distinguish direct GUI identity and workspace from title or filesystem inference'
);
assert(
    source.includes("new URL(window.location.href).pathname")
        && !source.includes('window.location.href.match(/\\/c\\/'),
    'Standalone route parsing must not emit an invalid regex inside the Runtime.evaluate template literal'
);

const undoLocatorSource = source.slice(
    source.indexOf('async function evaluateUndoLocator'),
    source.indexOf('async function captureUndoAnchor')
);
const lateClientCloseFlag = undoLocatorSource.indexOf('closeLateClient = true;');
const normalClientClose = undoLocatorSource.indexOf('if (client) await client.close().catch(() => {});');
assert(
    undoLocatorSource.includes('const pendingClient = CDP({ target: target.webSocketDebuggerUrl });')
        && undoLocatorSource.includes('pendingClient.then(lateClient =>')
        && undoLocatorSource.includes('if (closeLateClient && lateClient !== client)')
        && undoLocatorSource.includes("client = await withTimeout(pendingClient, 3000, 'CDP undo locator timeout')")
        && lateClientCloseFlag >= 0
        && lateClientCloseFlag < normalClientClose,
    'the Undo CDP connection must retain and close a client that resolves after the connection timeout'
);

assert(
    source.includes("const { selectUndoMatch } = require('./undo_anchor');")
        && source.includes('const SELECT_UNDO_MATCH_SOURCE = selectUndoMatch.toString();')
        && source.includes('scopeKey: selected.scopeKey || null'),
    'CDP Undo must carry a stable message-scope key into the browser-side fail-closed matcher'
);

const locatorSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui_locators.js'), 'utf8');
const promptNormalizerSource = locatorSource.slice(
    locatorSource.indexOf('normalizePromptText:'),
    locatorSource.indexOf('isVisibleControl:')
);
const promptMatchingSource = locatorSource.slice(
    locatorSource.indexOf('textWithoutActionControls:'),
    locatorSource.indexOf('findPromptScopeForUndoControl:')
);
const nativeUndoSource = locatorSource.slice(
    locatorSource.indexOf('isNativeUndoControl:'),
    locatorSource.indexOf('getNativeUndoControls:')
);
const promptScopeSource = locatorSource.slice(
    locatorSource.indexOf('findPromptScopeForUndoControl:'),
    locatorSource.indexOf('getUndoScopeKey:')
);
assert(
    nativeUndoSource.includes("el.getAttribute('data-testid') === 'revert-button'")
        && nativeUndoSource.includes("label === 'undo changes up to this point'"),
    'the native Undo locator must recognize the current Standalone revert-button semantics'
);
assert(
    promptScopeSource.includes("control.closest('[data-testid=\"user-input-step\"]')")
        && promptScopeSource.includes('AG_UI.getNativeUndoControls().filter(candidate => step.contains(candidate)).length === 1')
        && promptScopeSource.includes('AG_UI.scopeMatchesPrompt(step, prompt)'),
    'the current Standalone Undo control must bind to exactly one nearest user-input-step before prompt matching'
);
assert(
    promptNormalizerSource.includes('.trim(),')
        && !promptNormalizerSource.includes('toLowerCase')
        && promptMatchingSource.includes('AG_UI.normalizePromptText(prompt)')
        && promptMatchingSource.includes("AG_UI.normalizePromptText(node.textContent || '') === expected")
        && !promptMatchingSource.includes('normalizeUndoText'),
    'prompt matching must preserve case so Deploy cannot match deploy while Undo labels remain case-insensitive'
);

assert(
    locatorSource.includes('getUndoScopeKey: (scope) =>')
        && locatorSource.includes("const stableAttributes = ['data-message-id', 'data-messageid'];")
        && !locatorSource.includes("'data-testid', 'data-id', 'id'")
        && locatorSource.includes('scopeKey: AG_UI.getUndoScopeKey(group.scope)'),
    'captured Undo anchors must accept only message-specific identity attributes, not generic test IDs'
);

const indexSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
assert(indexSource.includes("bot.command('undo'"), '/undo must be registered');
assert(indexSource.includes('undo_pick_'), 'picker callbacks must exist');
assert(indexSource.includes('undo_confirm_'), 'confirmation callbacks must exist');
assert(indexSource.includes('recordUndoHistory'), 'delivered prompts must be recorded for undo history');
assert(!indexSource.includes('git reset'), 'must not use git reset');
assert(!indexSource.includes("document.execCommand('undo')"), 'must not simulate keyboard undo');

console.log('CDP undo usage tests passed');
