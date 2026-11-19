const EFFORT_DISPLAY_ALIASES = {
    xhigh: 'Extra',
    'x-high': 'Extra',
    extrahigh: 'Extra',
    'extra-high': 'Extra',
    'extra high': 'Extra',
    extra_high: 'Extra',
};

const EFFORT_ALIAS_GROUPS = [
    ['extra', 'xhigh', 'x-high', 'extrahigh', 'extra-high', 'extra high', 'extra_high'],
    ['minimal', 'min'],
    ['medium', 'med'],
    ['maximum', 'max'],
];

const EFFORT_SORT_RANK = {
    off: 0,
    none: 0,
    minimal: 10,
    min: 10,
    low: 20,
    medium: 30,
    med: 30,
    standard: 30,
    balanced: 30,
    default: 30,
    high: 40,
    extra: 50,
    xhigh: 50,
    max: 60,
    maximum: 60,
    ultra: 70,
    extreme: 80,
};

function normalizeModelText(text) {
    return (text || '')
        .toLowerCase()
        .replace(/选择模型/g, ' ')
        .replace(/select model/g, ' ')
        .replace(/current/g, ' ')
        .replace(/当前/g, ' ')
        .replace(/fla\s*h/g, 'flash')
        .replace(/fa\s*t/g, 'fast')
        .replace(/\bopus?\b/g, 'opus')
        .replace(/\bfast\b/g, ' ')
        .replace(/\bnew\b/g, ' ')
        .replace(/[^a-z0-9]+/g, '');
}

function findBestModelOption(options, targetModel) {
    const target = normalizeModelText(targetModel);
    if (!target) return null;

    const normalized = options.map(option => ({
        option,
        key: normalizeModelText(option)
    }));

    const exact = normalized.find(item => item.key === target);
    if (exact) return exact.option;

    const partial = normalized.find(item => item.key.includes(target) || target.includes(item.key));
    return partial ? partial.option : null;
}

function normalizeEffortKey(raw) {
    return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeEffortDisplayName(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    const compact = normalizeEffortKey(trimmed);
    if (EFFORT_DISPLAY_ALIASES[lower]) return EFFORT_DISPLAY_ALIASES[lower];
    if (EFFORT_DISPLAY_ALIASES[compact]) return EFFORT_DISPLAY_ALIASES[compact];
    if (trimmed === lower) {
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
    return trimmed;
}

function getEffortAliases(raw) {
    const lower = String(raw || '').trim().toLowerCase();
    const compact = normalizeEffortKey(raw);
    if (!compact) return [];
    const set = new Set([lower, compact]);
    for (const group of EFFORT_ALIAS_GROUPS) {
        if (group.some(g => g === lower || normalizeEffortKey(g) === compact)) {
            for (const alias of group) {
                set.add(alias);
                set.add(normalizeEffortKey(alias));
            }
        }
    }
    return Array.from(set).filter(Boolean);
}

function effortsMatch(candidateLabel, candidateId, targetEffort) {
    const targetAliases = new Set(getEffortAliases(targetEffort));
    if (targetAliases.size === 0) return false;
    for (const cand of [candidateLabel, candidateId]) {
        if (!cand) continue;
        const lower = String(cand).trim().toLowerCase();
        const compact = normalizeEffortKey(cand);
        if (targetAliases.has(lower) || targetAliases.has(compact)) return true;
    }
    return false;
}

function getEffortEmoji(label, id = '') {
    const keys = [normalizeEffortKey(label), normalizeEffortKey(id)].filter(Boolean);
    for (const k of keys) {
        if (['off', 'none', 'minimal', 'min', 'low'].includes(k)) return '🟢';
        if (['medium', 'med', 'normal', 'default', 'balanced', 'standard'].includes(k)) return '🟡';
        if (k === 'high') return '🔴';
        if (['extra', 'xhigh', 'extrahigh', 'max', 'maximum', 'ultra', 'extreme', 'turbo', 'deep'].includes(k)) return '🔥';
    }
    return '⚡';
}

function buildTierKeyboardRows(modelIdx, tiers, currentTier = null) {
    const normalized = (Array.isArray(tiers) && tiers.length > 0 ? tiers : ['Low', 'Medium', 'High'])
        .map((entry, tierIdx) => {
            if (typeof entry === 'string') {
                return { id: normalizeEffortKey(entry), label: entry.trim(), tierIdx };
            }
            const label = String(entry.label || entry.name || entry.id || '').trim();
            const id = String(entry.id || normalizeEffortKey(label)).trim();
            return { id, label, tierIdx };
        })
        .filter(item => item.label.length > 0);

    const buttons = normalized.map(({ id, label, tierIdx }) => {
        const emoji = getEffortEmoji(label, id);
        const isCurrent = currentTier ? effortsMatch(label, id, currentTier) : false;
        const text = `${emoji} ${label}${isCurrent ? ' ✓' : ''}`;
        const directCb = `md_sel_${modelIdx}_${label}`;
        const callback_data = Buffer.byteLength(directCb, 'utf8') <= 64
            ? directCb
            : `md_seli_${modelIdx}_${tierIdx}`;
        return { text, callback_data };
    });

    // Keep up to 4 short tiers on a single compact row; wrap neatly at 3 per row for 5+ future tiers
    const maxPerRow = buttons.length <= 4 ? 4 : 3;
    const rows = [];
    for (let i = 0; i < buttons.length; i += maxPerRow) {
        rows.push(buttons.slice(i, i + maxPerRow));
    }
    return rows;
}

function parseModelAndEffort(rawTarget, directModelNames = [], effortBaseNames = []) {
    const trimmed = String(rawTarget || '').trim();
    if (!trimmed) return { baseName: '', effort: null, isDirect: false };

    const stripPunct = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const targetNorm = stripPunct(trimmed);

    // 1. Exact match against known direct (non-tiered) models like "Orchestrator (Neon)" or "GPT-OSS 120B (Medium)"
    for (const direct of directModelNames) {
        if (stripPunct(direct) === targetNorm) {
            return { baseName: direct, effort: null, isDirect: true };
        }
    }

    // 2. Prefix match against known effort-group base names (longest base first)
    const sortedBases = [...effortBaseNames].filter(Boolean).sort((a, b) => b.length - a.length);
    for (const base of sortedBases) {
        const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`^${escaped}(?:\\s*\\(([^()]+)\\)|\\s+(.+))?$`, 'i');
        const m = trimmed.match(re);
        if (m) {
            const rawEffort = (m[1] || m[2] || '').trim();
            return {
                baseName: base,
                effort: rawEffort || null,
                isDirect: false,
            };
        }
    }

    // 3. Generic trailing parenthesized effort: e.g. "Gemini 4 Neon (Extra)", "Claude Opus 5.5 (Ultra)"
    // Skip known direct models whose base label naturally includes parentheses
    if (!/^(?:gpt-oss|orchestrator)\b/i.test(trimmed)) {
        const parenMatch = trimmed.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
        if (parenMatch) {
            return {
                baseName: parenMatch[1].trim(),
                effort: parenMatch[2].trim(),
                isDirect: false,
            };
        }
    }

    // 4. Generic trailing known effort word without parentheses: e.g. "Gemini 4 Neon Extra"
    if (!/^(?:gpt-oss|orchestrator)\b/i.test(trimmed)) {
        const wordMatch = trimmed.match(/^(.+?)\s+(minimal|min|low|medium|med|high|extra|xhigh|x-high|max|maximum|ultra|extreme|off|none)\s*$/i);
        if (wordMatch) {
            return {
                baseName: wordMatch[1].trim(),
                effort: wordMatch[2].trim(),
                isDirect: false,
            };
        }
    }

    return { baseName: trimmed, effort: null, isDirect: false };
}

function extractEffortOptionsFromConfigs(baseName, clientModelConfigs = []) {
    if (!baseName || !Array.isArray(clientModelConfigs)) return [];
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escaped}\\s*\\(([^()]+)\\)$`, 'i');
    const seen = new Set();
    const found = [];

    for (const cfg of clientModelConfigs) {
        if (!cfg || cfg.disabled || !cfg.label) continue;
        const m = String(cfg.label).trim().match(re);
        if (!m) continue;
        const rawCode = m[1].trim();
        const id = normalizeEffortKey(rawCode);
        const label = normalizeEffortDisplayName(rawCode);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        found.push({ id, label, order: found.length });
    }

    found.sort((a, b) => {
        const ra = EFFORT_SORT_RANK[a.id] ?? EFFORT_SORT_RANK[normalizeEffortKey(a.label)] ?? 45;
        const rb = EFFORT_SORT_RANK[b.id] ?? EFFORT_SORT_RANK[normalizeEffortKey(b.label)] ?? 45;
        if (ra !== rb) return ra - rb;
        return a.order - b.order;
    });

    return found.map(({ id, label }) => ({ id, label }));
}

module.exports = {
    EFFORT_DISPLAY_ALIASES,
    findBestModelOption,
    normalizeModelText,
    normalizeEffortKey,
    normalizeEffortDisplayName,
    getEffortAliases,
    effortsMatch,
    getEffortEmoji,
    buildTierKeyboardRows,
    parseModelAndEffort,
    extractEffortOptionsFromConfigs,
};
