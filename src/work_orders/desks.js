// Desk + order file helpers shared by the runner (core.js) and the Telegram UI
// (telegram.js). Everything is plain files so both processes see the same state.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DESK_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/; // ≤32 chars keeps callback_data < 64 bytes
const INSTR_START = '<!-- wo-desk-instructions -->';
const INSTR_END = '<!-- /wo-desk-instructions -->';

const MODEL_PRESETS = [
    { key: '0', label: null, value: null },
    { key: '1', label: '⚡ Gemini 3.8 Flash (Low)', value: 'Gemini 3.8 Flash (Low)' },
    { key: '2', label: '⚡ Gemini 3.8 Flash (High)', value: 'Gemini 3.8 Flash (High)' },
    { key: '3', label: '💎 Gemini 4 Carbon (High)', value: 'Gemini 4 Carbon (High)' },
    { key: '4', label: '🧠 Gemini 4 Argon (High)', value: 'Gemini 4 Argon (High)' },
    { key: '5', label: '🔹 Gemini 4 Hydrogen (High)', value: 'Gemini 4 Hydrogen (High)' },
    { key: '6', label: '🎭 Claude Sonnet 5.5 (High)', value: 'Claude Sonnet 5.5 (High)' },
    { key: '7', label: '👑 Claude Opus 5.5 (High)', value: 'Claude Opus 5.5 (High)' },
];

function defaultDir() {
    if (process.env.WORK_ORDERS_DIR) return process.env.WORK_ORDERS_DIR.replace(/^~(?=$|\/)/, os.homedir());
    const { config } = require('../platform');
    return path.join(config.projectsDir, '.agts-work-orders');
}

function ensureLayout(dir) {
    for (const sub of ['inbox', 'running', 'done', 'failed', 'results', 'desks', 'archive']) {
        fs.mkdirSync(path.join(dir, sub), { recursive: true });
    }
}

// Free text → desk name ("Yorum Masası" → "yorum-masasi").
function slugifyDesk(text) {
    const map = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
    return String(text || '')
        .replace(/[çğıİöşüÇĞÖŞÜ]/g, ch => map[ch])
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '')
        .slice(0, 32);
}

function deskFolderName(desk) {
    return `wo-${desk}`;
}

function deskPath(dir, desk) {
    return path.join(dir, 'desks', deskFolderName(desk));
}

function deskSeed(desk, instructions) {
    return `# Desk: ${desk}

This folder is an **AGTS Work Orders desk**. Orders arrive in the chat as messages
that start with \`[AGTS Work Order <id>]\`.

## Rules for every order
- Read this file before working on an order.
- If an order points at another project folder, read that project's \`AGENT.md\`
  before touching it, and follow its rules.
- Always finish by writing the result file named at the end of the order — also
  when the order failed. Its first line is \`STATUS: done\` or \`STATUS: failed\`.
  The order counts as finished only when that file exists.
- Do not ask questions in the chat; nobody is watching it live. If something is
  unclear, make the safest reasonable choice and say so in the result file.

## Desk instructions
${INSTR_START}
${(instructions || '').trim() || '_(none yet — set them from Telegram: /wo → desk → Edit instructions)_'}
${INSTR_END}
`;
}

function readDeskConfig(dir, desk) {
    try {
        return JSON.parse(fs.readFileSync(path.join(deskPath(dir, desk), 'desk.json'), 'utf8'));
    } catch (_) {
        return {};
    }
}

function writeDeskConfig(dir, desk, cfg) {
    fs.writeFileSync(path.join(deskPath(dir, desk), 'desk.json'), JSON.stringify(cfg, null, 2));
}

function setDeskThreadId(dir, desk, threadId) {
    const cfg = readDeskConfig(dir, desk);
    cfg.threadId = threadId;
    writeDeskConfig(dir, desk, cfg);
    return cfg;
}

function setDeskModel(dir, desk, model) {
    const cfg = readDeskConfig(dir, desk);
    const cleaned = model && String(model).trim() ? String(model).trim() : null;
    if (cleaned) cfg.model = cleaned;
    else delete cfg.model;
    writeDeskConfig(dir, desk, cfg);
    return cfg;
}

// Idempotent: creates the folder/AGENT.md/desk.json only if missing.
function ensureDesk(dir, desk, { instructions = '', approval, model, ensureMemory } = {}) {
    const p = deskPath(dir, desk);
    fs.mkdirSync(p, { recursive: true });
    const agentMd = path.join(p, 'AGENT.md');
    if (!fs.existsSync(agentMd)) fs.writeFileSync(agentMd, deskSeed(desk, instructions));
    if (!fs.existsSync(path.join(p, 'desk.json'))) {
        const initCfg = { approval: approval || 'auto', createdAt: new Date().toISOString() };
        if (model && String(model).trim()) initCfg.model = String(model).trim();
        writeDeskConfig(dir, desk, initCfg);
    }
    if (ensureMemory) ensureMemory(p);
    return p;
}

function deskExists(dir, desk) {
    return fs.existsSync(deskPath(dir, desk));
}

function listDesks(dir) {
    try {
        return fs.readdirSync(path.join(dir, 'desks'), { withFileTypes: true })
            .filter(d => d.isDirectory() && d.name.startsWith('wo-'))
            .map(d => d.name.slice(3))
            .sort();
    } catch (_) {
        return [];
    }
}

function getInstructions(dir, desk) {
    const md = fs.readFileSync(path.join(deskPath(dir, desk), 'AGENT.md'), 'utf8');
    const s = md.indexOf(INSTR_START);
    const e = md.indexOf(INSTR_END);
    if (s === -1 || e === -1) return '';
    return md.slice(s + INSTR_START.length, e).trim();
}

// Replaces only the instructions section; the rules above and the memory block
// the agent maintains below stay untouched.
function setInstructions(dir, desk, text) {
    const file = path.join(deskPath(dir, desk), 'AGENT.md');
    const md = fs.readFileSync(file, 'utf8');
    const s = md.indexOf(INSTR_START);
    const e = md.indexOf(INSTR_END);
    const block = `${INSTR_START}\n${text.trim()}\n${INSTR_END}`;
    const next = s !== -1 && e !== -1
        ? md.slice(0, s) + block + md.slice(e + INSTR_END.length)
        : md.trimEnd() + `\n\n## Desk instructions\n${block}\n`;
    fs.writeFileSync(file, next);
}

// Soft delete: the desk (with its memory) moves to archive/, never rm -rf.
function archiveDesk(dir, desk) {
    const dest = path.join(dir, 'archive', `${deskFolderName(desk)}-${Date.now()}`);
    fs.renameSync(deskPath(dir, desk), dest);
    return dest;
}

function newOrderId(desk) {
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
    return `${ts}-${desk}`;
}

// Writes an order into inbox/ atomically (tmp + rename) so the runner never reads half a file.
function writeOrder(dir, { desk, body, approval, timeoutMin, model }) {
    // Two orders for the same desk in the same second must not overwrite each other.
    const base = newOrderId(desk);
    let id = base;
    for (let n = 2; ['inbox', 'running', 'done', 'failed'].some(sub => fs.existsSync(path.join(dir, sub, `${id}.md`))); n++) {
        id = `${base}-${n}`;
    }
    const lines = ['---', `desk: ${desk}`];
    if (approval) lines.push(`approval: ${approval}`);
    if (model && String(model).trim()) lines.push(`model: "${String(model).trim().replace(/"/g, '')}"`);
    if (timeoutMin) lines.push(`timeout: ${timeoutMin}`);
    lines.push('---', body.trim(), '');
    const tmp = path.join(dir, 'inbox', `.${id}.tmp`);
    fs.writeFileSync(tmp, lines.join('\n'));
    fs.renameSync(tmp, path.join(dir, 'inbox', `${id}.md`));
    return id;
}

function readHistory(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'));
    } catch (_) {
        return [];
    }
}

function appendHistory(dir, entry, keep = 200) {
    const h = readHistory(dir);
    h.push(entry);
    fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify(h.slice(-keep), null, 2));
}

function lastResult(dir, desk) {
    const h = readHistory(dir).filter(x => x.desk === desk);
    const last = h[h.length - 1];
    if (!last) return null;
    let text = '';
    try { text = fs.readFileSync(path.join(dir, 'results', `${last.id}.md`), 'utf8'); } catch (_) { /* no result file */ }
    return { ...last, text };
}

function readLiveOrders(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).orders || [];
    } catch (_) {
        return [];
    }
}

module.exports = {
    DESK_RE,
    MODEL_PRESETS,
    defaultDir,
    ensureLayout,
    slugifyDesk,
    deskFolderName,
    deskPath,
    deskSeed,
    ensureDesk,
    deskExists,
    listDesks,
    readDeskConfig,
    writeDeskConfig,
    setDeskThreadId,
    setDeskModel,
    getInstructions,
    setInstructions,
    archiveDesk,
    writeOrder,
    readHistory,
    appendHistory,
    lastResult,
    readLiveOrders,
};
