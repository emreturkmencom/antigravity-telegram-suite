// Opt-in: on workspace switch, ensure the project has a lightweight, agent-agnostic
// memory convention block — no MCP server, no vector DB, just a markdown section
// agents edit directly. Enable with AUTO_MEMORY_CONVENTION=true in .env.

const fs = require('fs');
const path = require('path');

const MARKER_START = '<!-- agts-memory:v1 -->';
const MARKER_END = '<!-- /agts-memory -->';

const POINTER_START = '<!-- agts-pointer:v1 -->';
const POINTER_END = '<!-- /agts-pointer -->';

// Files that should point to AGENT.md if they exist
const POINTER_FILES = ['CLAUDE.md', 'GEMINI.md', '.cursorrules', '.windsurfrules'];
const DEFAULT_FILE = 'AGENT.md';

const POINTER_BLOCK = `${POINTER_START}
> [!IMPORTANT]
> All project rules, architectural decisions, and memory are stored in \`AGENT.md\`.
> Do not add new rules or memory to this file. Always read and edit \`AGENT.md\` directly.
${POINTER_END}
`;

const BLOCK = `${MARKER_START}
## Project Memory

> [!IMPORTANT]
> **MANDATORY AGENT ROUTINE**: Every time you complete a task that involves modifying code, you MUST update this file (\`AGENT.md\`) before ending your turn. Do NOT ask for permission.
> 1. **Decisions**: Add non-obvious design choices.
> 2. **Gotchas**: Add framework quirks, API weirdness, or system limits you discovered.
> 3. **Fixes**: Briefly summarize the root cause of hard-to-solve bugs.

**Context Window Management**
To keep this file effective, routinely prune outdated info. Edit existing lines instead of adding duplicates. Consolidate long sections.

### Decisions

### Conventions

### Gotchas

### Fixes
${MARKER_END}
`;

// Idempotent: no-op if disabled, path invalid. Injects memory block into AGENT.md
// and pointer blocks into any existing AI config files.
function ensureMemoryConvention(wsPath) {
    if (process.env.AUTO_MEMORY_CONVENTION !== 'true') return false;
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
    
    if (!existing.includes(MARKER_START)) {
        const separator = existing && !existing.endsWith('\n\n') ? (existing.endsWith('\n') ? '\n' : '\n\n') : '';
        fs.appendFileSync(target, separator + BLOCK);
    }

    // 2. Ensure other existing agent files have the pointer
    for (const name of POINTER_FILES) {
        const p = path.join(wsPath, name);
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            if (!content.includes(POINTER_START)) {
                const sep = content && !content.endsWith('\n\n') ? (content.endsWith('\n') ? '\n' : '\n\n') : '';
                fs.appendFileSync(p, sep + POINTER_BLOCK);
            }
        }
    }

    return true;
}

// Ensure CANDIDATE_FILES is exported for the /memory command
const CANDIDATE_FILES = [DEFAULT_FILE, ...POINTER_FILES];

module.exports = { ensureMemoryConvention, MARKER_START, MARKER_END, CANDIDATE_FILES };
