const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureMemoryConvention, MARKER_START, MARKER_START_V1, MARKER_END } = require('../src/memory_convention');

function withTmpDir(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agts-memory-'));
    try {
        fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function run() {
    // Disabled by default: no-op even against a real directory.
    delete process.env.AUTO_MEMORY_CONVENTION;
    withTmpDir((dir) => {
        const changed = ensureMemoryConvention(dir);
        assert.strictEqual(changed, false, 'should be a no-op when AUTO_MEMORY_CONVENTION is unset');
        assert.strictEqual(fs.existsSync(path.join(dir, 'AGENT.md')), false);
    });

    process.env.AUTO_MEMORY_CONVENTION = 'true';

    // No existing context file: creates AGENT.md with the block.
    withTmpDir((dir) => {
        const changed = ensureMemoryConvention(dir);
        assert.strictEqual(changed, true);
        const content = fs.readFileSync(path.join(dir, 'AGENT.md'), 'utf8');
        assert(content.includes(MARKER_START), 'AGENT.md should contain the memory marker');
    });

    // Existing CLAUDE.md: injects pointer to CLAUDE.md and still creates AGENT.md.
    withTmpDir((dir) => {
        fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# My Project\n\nSome existing notes.\n');
        const changed = ensureMemoryConvention(dir);
        assert.strictEqual(changed, true);
        assert.strictEqual(fs.existsSync(path.join(dir, 'AGENT.md')), true, 'AGENT.md must always be created');
        const claudeContent = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
        assert(claudeContent.includes('Some existing notes.'), 'original content should be preserved');
        assert(claudeContent.includes('agts-pointer:v1'), 'CLAUDE.md should contain the pointer marker');
        const agentContent = fs.readFileSync(path.join(dir, 'AGENT.md'), 'utf8');
        assert(agentContent.includes(MARKER_START), 'AGENT.md should contain the main memory marker');
    });

    // Idempotent: second call on already-annotated files is a no-op.
    withTmpDir((dir) => {
        ensureMemoryConvention(dir); // Creates AGENT.md
        const before = fs.readFileSync(path.join(dir, 'AGENT.md'), 'utf8');
        const changed = ensureMemoryConvention(dir);
        const after = fs.readFileSync(path.join(dir, 'AGENT.md'), 'utf8');
        assert.strictEqual(changed, true, 'returns true whenever it ran on a valid workspace');
        assert.strictEqual(before, after, 'file content should be untouched on second call');
    });

    // v1 -> v2 upgrade: instructions replaced, every existing entry kept.
    withTmpDir((dir) => {
        const v1 = '# Rules\n\nkeep me\n\n' + MARKER_START_V1 + '\n## Project Memory\n\n> MANDATORY AGENT ROUTINE: old text\n> Never append after `' + MARKER_END + '` (quoted marker).\n\n### Decisions\n- (2026-01-01) Use X because Y.\n\n### Fixes\n- (2026-01-02) Old fix story.\n' + MARKER_END + '\ntrailer\n';
        fs.writeFileSync(path.join(dir, 'AGENT.md'), v1);
        ensureMemoryConvention(dir);
        const out = fs.readFileSync(path.join(dir, 'AGENT.md'), 'utf8');
        assert(out.includes(MARKER_START), 'should carry the v2 marker');
        assert(!out.includes(MARKER_START_V1), 'v1 marker should be gone');
        assert(!out.includes('MANDATORY AGENT ROUTINE'), 'old instructions should be replaced');
        assert(out.includes('- (2026-01-01) Use X because Y.'), 'entries must survive');
        assert(out.includes('### Fixes\n- (2026-01-02) Old fix story.'), 'existing sections must survive');
        assert(out.startsWith('# Rules\n\nkeep me'), 'content before the block untouched');
        assert(out.endsWith(MARKER_END + '\ntrailer\n'), 'content after the block untouched');
        const again = (ensureMemoryConvention(dir), fs.readFileSync(path.join(dir, 'AGENT.md'), 'utf8'));
        assert.strictEqual(again, out, 'upgrade is idempotent');
    });

    // Size warning appears over budget and disappears once trimmed.
    withTmpDir((dir) => {
        process.env.AGTS_MEMORY_MAX_BYTES = '3000';
        ensureMemoryConvention(dir);
        const file = path.join(dir, 'AGENT.md');
        const big = fs.readFileSync(file, 'utf8').replace('### Gotchas\n', '### Gotchas\n' + '- (2026-01-01) filler entry line.\n'.repeat(200));
        fs.writeFileSync(file, big);
        ensureMemoryConvention(dir);
        const warned = fs.readFileSync(file, 'utf8');
        assert(warned.includes('Memory is over budget'), 'warning expected over budget');
        assert.strictEqual(warned.split('agts-memory-size -->').length, 3, 'exactly one warning block');
        ensureMemoryConvention(dir);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), warned, 'warning refresh is idempotent');
        fs.writeFileSync(file, warned.replace(/- \(2026-01-01\) filler entry line\.\n/g, ''));
        ensureMemoryConvention(dir);
        assert(!fs.readFileSync(file, 'utf8').includes('Memory is over budget'), 'warning removed under budget');
        delete process.env.AGTS_MEMORY_MAX_BYTES;
    });

    // Invalid path: no-op, does not throw.
    withTmpDir((dir) => {
        const missing = path.join(dir, 'does-not-exist');
        const changed = ensureMemoryConvention(missing);
        assert.strictEqual(changed, false);
    });

    delete process.env.AUTO_MEMORY_CONVENTION;
    console.log('✅ memory_convention tests passed!');
}

try {
    run();
} catch (err) {
    console.error(err);
    process.exit(1);
}
