const crypto = require('crypto');

const PRE_GUI_STATUSES = new Set(['received', 'queued', 'started', 'discarded']);
const LIVE_DELIVERY_STATUSES = new Set(['sent_to_gui', 'waiting']);

function isOutboundRecord(item) {
    return item && (
        item.direction === 'outbound'
        || item.outbound === true
        || /^outbound(?::|$)/.test(String(item.kind || ''))
    );
}

function undoAnchorText(item) {
    if (typeof item.undoAnchor === 'string') return item.undoAnchor;
    if (item.undoAnchor && typeof item.undoAnchor.text === 'string') return item.undoAnchor.text;
    return typeof item.displayText === 'string' ? item.displayText : '';
}

function hasUndoAnchorText(item) {
    return undoAnchorText(item).trim().length > 0;
}

function hasGuiDeliveryProof(item) {
    return item.status === 'completed'
        || item.deliveredToGui === true
        || LIVE_DELIVERY_STATUSES.has(item.status);
}

function normalizeUndoAnchor(item) {
    const source = item.undoAnchor;
    const text = undoAnchorText(item);
    const scopeKey = source && typeof source === 'object' && typeof source.scopeKey === 'string' && source.scopeKey.trim()
        ? source.scopeKey
        : null;
    const storedMatchIndex = source && typeof source === 'object' ? Number(source.matchIndex) : NaN;
    const resolvedMatchIndex = scopeKey && Number.isInteger(storedMatchIndex) && storedMatchIndex >= 0
        ? storedMatchIndex
        : null;
    return { text, matchIndex: resolvedMatchIndex, scopeKey };
}

function listUndoCandidates(items, chatId) {
    if (!Array.isArray(items)) return [];

    const matchingItems = items
        .filter(item => (
            item
            && item.chatId === chatId
            && item.targetId
            && !PRE_GUI_STATUSES.has(item.status)
            && !isOutboundRecord(item)
            && item.reason !== 'closeout_only'
            && hasGuiDeliveryProof(item)
            && hasUndoAnchorText(item)
            && item.undone !== true
        ));
    return matchingItems
        .map(item => ({ ...item, undoAnchor: normalizeUndoAnchor(item) }))
        .reverse();
}

function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
}

function getUndoPage(candidates, page = 0, pageSize = 6) {
    const items = Array.isArray(candidates) ? candidates : [];
    const size = positiveInteger(pageSize, 6);
    const pageCount = Math.ceil(items.length / size);
    const requestedPage = Math.max(0, Math.floor(Number(page) || 0));
    const currentPage = pageCount === 0 ? 0 : Math.min(requestedPage, pageCount - 1);
    const start = currentPage * size;

    return {
        items: items.slice(start, start + size),
        page: currentPage,
        pageSize: size,
        total: items.length,
        pageCount,
        hasPrevious: currentPage > 0,
        hasNext: currentPage + 1 < pageCount
    };
}

function copyCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return candidate;
    return {
        ...candidate,
        undoAnchor: candidate.undoAnchor && typeof candidate.undoAnchor === 'object'
            ? { ...candidate.undoAnchor }
            : candidate.undoAnchor
    };
}

function defaultUndoToken() {
    return crypto.randomBytes(9).toString('base64url');
}

function createUndoSessionStore(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const ttlMs = positiveInteger(options.ttlMs, 5 * 60 * 1000);
    const createToken = typeof options.createToken === 'function'
        ? options.createToken
        : defaultUndoToken;
    const sessions = new Map();

    function clearExpired() {
        const currentTime = now();
        let removed = 0;
        for (const [token, session] of sessions) {
            if (session.expiresAt <= currentTime) {
                sessions.delete(token);
                removed += 1;
            }
        }
        return removed;
    }

    function issue(candidate) {
        clearExpired();
        let token = null;
        for (let attempts = 0; attempts < 10; attempts += 1) {
            const nextToken = String(createToken() || '');
            if (nextToken && !sessions.has(nextToken)) {
                token = nextToken;
                break;
            }
        }
        if (!token) throw new Error('undo_session_token_collision');

        sessions.set(token, {
            candidate: copyCandidate(candidate),
            chatId: candidate && candidate.chatId,
            expiresAt: now() + ttlMs
        });
        return token;
    }

    function read(token, chatId, consume) {
        const session = sessions.get(token);
        if (!session) return null;
        if (session.expiresAt <= now()) {
            sessions.delete(token);
            return null;
        }
        if (chatId != null && session.chatId !== chatId) return null;
        if (consume) sessions.delete(token);
        return copyCandidate(session.candidate);
    }

    return {
        issue,
        create: issue,
        get: (token, chatId) => read(token, chatId, false),
        consume: (token, chatId) => read(token, chatId, true),
        remove: token => sessions.delete(token),
        clearExpired
    };
}

function normalizeLabelText(value) {
    return String(value || '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncateLabel(value, maxLength) {
    const characters = Array.from(value);
    if (characters.length <= maxLength) return value;
    return characters.slice(0, Math.max(0, maxLength - 1)).join('') + '…';
}

function formatUndoLabel(candidate = {}, index = 0) {
    const position = Math.max(0, Math.floor(Number(index) || 0)) + 1;
    const prompt = normalizeLabelText(candidate.displayText)
        || normalizeLabelText(undoAnchorText(candidate))
        || '(untitled request)';
    const threadName = normalizeLabelText(candidate.threadName);
    const description = threadName ? `${threadName} · ${prompt}` : prompt;
    return truncateLabel(`${position}. ${description}`, 64);
}

module.exports = {
    listUndoCandidates,
    getUndoPage,
    createUndoSessionStore,
    formatUndoLabel
};
