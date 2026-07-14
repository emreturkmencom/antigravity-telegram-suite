const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_MAX_ITEMS = 100;

function defaultStorePath() {
    return path.join(os.homedir(), '.gemini', 'antigravity', 'undo_history.json');
}

function createUndoStore(options = {}) {
    const filePath = options.filePath || defaultStorePath();
    const maxItems = Number.isInteger(options.maxItems) && options.maxItems > 0
        ? options.maxItems
        : DEFAULT_MAX_ITEMS;
    let items = loadItems(filePath);

    function loadItems(targetPath) {
        try {
            if (!fs.existsSync(targetPath)) return [];
            const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
            return Array.isArray(parsed?.items) ? parsed.items : [];
        } catch (_) {
            return [];
        }
    }

    function persist() {
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify({ items }, null, 2));
        } catch (err) {
            console.warn(`[undo_store] Failed to persist history: ${err.message}`);
        }
    }

    function list() {
        return items.map(item => ({ ...item }));
    }

    function add(record) {
        const id = record.id || crypto.randomBytes(8).toString('hex');
        const entry = {
            id,
            chatId: record.chatId,
            targetId: record.targetId || null,
            displayText: String(record.displayText || '').slice(0, 500),
            undoAnchor: record.undoAnchor && typeof record.undoAnchor === 'object'
                ? { ...record.undoAnchor }
                : { text: String(record.displayText || '').trim(), matchIndex: null, scopeKey: null },
            threadId: record.threadId || null,
            threadName: record.threadName || null,
            workspace: record.workspace || null,
            status: record.status || 'sent_to_gui',
            deliveredToGui: record.deliveredToGui !== false,
            createdAt: record.createdAt || Date.now(),
            undone: false
        };
        items.push(entry);
        if (items.length > maxItems) {
            items = items.slice(items.length - maxItems);
        }
        persist();
        return { ...entry };
    }

    function markUndone(id) {
        const item = items.find(entry => entry.id === id);
        if (!item) return null;
        item.undone = true;
        item.status = 'undone';
        persist();
        return { ...item };
    }

    function clear() {
        items = [];
        persist();
    }

    return {
        filePath,
        list,
        add,
        markUndone,
        clear
    };
}

module.exports = { createUndoStore, defaultStorePath };
