// Opt-in: on workspace switch, ensure the project has a lightweight, agent-agnostic
// memory convention block — no MCP server, no vector DB, just a markdown section
// agents edit directly. Enable with AUTO_MEMORY_CONVENTION=true in .env.

const fs = require('fs');
const path = require('path');

// v2: v1 metni ajanlari "her gorevden sonra yaz" diye zorluyordu; sonuc dosyanin
// bir degisiklik gunlugune donmesiydi (yzturkey: 58 KB, %76'si gunluk). v2 yalnizca
// kalici bilgiyi ister ve bir boyut butcesi koyar. Eski v1 bloklari girdileri
// korunarak yerinde yukseltilir (bkz. upgradeV1Block).
const MARKER_START = '<!-- agts-memory:v2 -->';
const MARKER_START_V1 = '<!-- agts-memory:v1 -->';
const MARKER_END = '<!-- /agts-memory -->';

const WARNING_START = '<!-- agts-memory-size -->';
const WARNING_END = '<!-- /agts-memory-size -->';

// Blok butcesi (bayt). Bu dosya her oturumun basinda tamamen okunuyor; butceyi
// asan her satir her gorevde odeniyor.
const DEFAULT_MAX_BYTES = 12000;

const POINTER_START = '<!-- agts-pointer:v1 -->';
const POINTER_END = '<!-- /agts-pointer -->';

// Files that should point to AGENT.md if they exist
const POINTER_FILES = ['CLAUDE.md', 'GEMINI.md', '.cursorrules', '.windsurfrules'];
const DEFAULT_FILE = 'AGENT.md';

const POINTER_BLOCK = `${POINTER_START}
> [!IMPORTANT]
> **The source of truth for this project is \`AGENT.md\`. Read it first.**
> Do not add new rules or memory to this file — write them in \`AGENT.md\`.
>
> Anything below this line is **legacy** and may be stale or contradict
> \`AGENT.md\`. When the two disagree, \`AGENT.md\` wins. If you rely on
> something from below, move it into \`AGENT.md\` first so the next agent
> finds it in the right place.
${POINTER_END}
`;

function maxBytes() {
    const n = parseInt(process.env.AGTS_MEMORY_MAX_BYTES || '', 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

// Instructions only — everything from the start marker up to the first ### heading.
function header() {
    return `${MARKER_START}
## Project Memory

> [!IMPORTANT]
> **This is the project's long-term memory, not a changelog.** Before ending a
> task, ask: *did I learn something a future agent needs and cannot get from the
> code or \`git log\`?* If yes, write it here without asking. **Most tasks need
> no entry.**
> - **Write:** a non-obvious decision and its reason, a convention, a gotcha
>   (framework quirk, API limit, trap that cost you time).
> - **Never write:** what you changed, which files you touched, or the story of
>   a fix. That is what \`git log\` is for.

**How to write an entry**
- Write **inside this block**, under the matching \`###\` heading — never after
  \`${MARKER_END}\`. Move stray entries you find there into the right section.
- One entry = one rule, at most 2 lines: \`- (YYYY-MM-DD) Do X, because Y.\`
  The date shows what may be stale.
- **Update or replace** an existing entry instead of adding a near-duplicate.
  When an entry is no longer true, delete it.
- If code comments cite this file (\`see AGENT.md\`), the cited rule must exist here.

**Budget: keep this block under ${Math.round(maxBytes() / 1000)} KB.** The whole file is loaded at the start of
every session, so every line is paid for on every task. Over budget → before
adding anything, merge duplicates, shorten long entries to the rule itself, and
delete what code, tests or git already record.

`;
}

const SECTIONS = `### Decisions

### Conventions

### Gotchas
`;

function buildBlock() {
    return `${header()}${SECTIONS}${MARKER_END}
`;
}

// Talimat metni bitis isaretini `backtick` icinde ALINTILIYOR; duz indexOf o alintiyi
// blogun sonu sanar. Gercek isaret her zaman kendi satirinin basindadir.
function findBlockEnd(content, from) {
    let i = content.indexOf(MARKER_END, from);
    while (i !== -1 && i > 0 && content[i - 1] !== '\n') {
        i = content.indexOf(MARKER_END, i + 1);
    }
    return i;
}

// v1 -> v2: replace only the instruction header (start marker .. first ###);
// every section and entry below it is kept byte-for-byte.
function upgradeV1Block(content) {
    const s = content.indexOf(MARKER_START_V1);
    if (s === -1) return content;
    const e = findBlockEnd(content, s);
    if (e === -1) return content;
    const firstSection = content.indexOf('\n### ', s);
    const bodyStart = firstSection !== -1 && firstSection < e ? firstSection + 1 : e;
    return content.slice(0, s) + header() + content.slice(bodyStart);
}

// Blok butceyi asiyorsa basliga gorunur bir uyari koyar, altina dusunce kaldirir.
// Ajan bunu her oturumda ilk okudugu yerde gorur; "ara sira sadelestir" demekten
// farkli olarak olculebilir ve kendiliginden kaybolur.
function refreshSizeWarning(content) {
    const s = content.indexOf(MARKER_START);
    if (s === -1) return content;
    const e = findBlockEnd(content, s);
    if (e === -1) return content;

    let block = content.slice(s, e);
    const ws = block.indexOf(WARNING_START);
    if (ws !== -1) {
        const we = block.indexOf(WARNING_END, ws);
        if (we !== -1) block = block.slice(0, ws) + block.slice(we + WARNING_END.length + 1);
    }

    const size = Buffer.byteLength(block, 'utf8');
    const limit = maxBytes();
    if (size > limit) {
        const warning = `${WARNING_START}
> [!CAUTION]
> **Memory is over budget: ${(size / 1000).toFixed(1)} KB / ${(limit / 1000).toFixed(0)} KB.** Before adding anything,
> consolidate: merge duplicates, cut entries to the rule itself, delete what git or code already records.
${WARNING_END}
`;
        const afterMarker = block.indexOf('\n') + 1;
        block = block.slice(0, afterMarker) + warning + block.slice(afterMarker);
    }
    return content.slice(0, s) + block + content.slice(e);
}

// Idempotent: no-op if disabled, path invalid. Injects memory block into AGENT.md
// and pointer blocks into any existing AI config files.
function ensureMemoryConvention(wsPath, opts = {}) {
    // opts.force: Work Orders masalari gibi AGTS'nin kendi olusturdugu klasorlerde
    // global ayardan bagimsiz calisir (masa hafizasi bu kurala dayaniyor).
    if (process.env.AUTO_MEMORY_CONVENTION !== 'true' && !opts.force) return false;
    if (!wsPath) return false;

    try {
        if (!fs.statSync(wsPath).isDirectory()) return false;
    } catch (e) {
        return false;
    }

    // 1. Ensure AGENT.md has the main block
    const target = path.join(wsPath, DEFAULT_FILE);
    let existing = '';
    if (fs.existsSync(target)) {
        existing = fs.readFileSync(target, 'utf8');
    }
    
    let next = existing;
    if (next.includes(MARKER_START_V1)) {
        next = upgradeV1Block(next);
    } else if (!next.includes(MARKER_START)) {
        const separator = next && !next.endsWith('\n\n') ? (next.endsWith('\n') ? '\n' : '\n\n') : '';
        next = next + separator + buildBlock();
    }
    next = refreshSizeWarning(next);
    if (next !== existing) fs.writeFileSync(target, next);

    // 2. Ensure other existing agent files have the pointer
    for (const name of POINTER_FILES) {
        const p = path.join(wsPath, name);
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            if (!content.includes(POINTER_START)) {
                // PREPEND, append DEGIL. Bu dosyalar genelde eski kurallarla
                // dolu; isaretci sona eklenirse ajan once o eski icerigi
                // okuyor, "asil kaynak AGENT.md" uyarisini EN SON goruyor.
                // Yonlendirmenin ise yaramasi icin ilk satirda olmasi gerekir.
                fs.writeFileSync(p, POINTER_BLOCK + '\n' + content);
            }
        }
    }

    return true;
}

// Ensure CANDIDATE_FILES is exported for the /memory command
const CANDIDATE_FILES = [DEFAULT_FILE, ...POINTER_FILES];

module.exports = { ensureMemoryConvention, MARKER_START, MARKER_START_V1, MARKER_END, CANDIDATE_FILES };
