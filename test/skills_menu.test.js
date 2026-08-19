const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILLS_MENU_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'skills_menu_state.json');

// Test state save and read
function isSkillsMenuEnabled() {
    try {
        if (fs.existsSync(SKILLS_MENU_FILE)) {
            const data = JSON.parse(fs.readFileSync(SKILLS_MENU_FILE, 'utf8'));
            if (typeof data.enabled === 'boolean') return data.enabled;
        }
    } catch(e) {}
    return false; // Default OFF
}

function setSkillsMenuEnabled(enabled) {
    try {
        const dir = path.dirname(SKILLS_MENU_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SKILLS_MENU_FILE, JSON.stringify({ enabled: !!enabled }, null, 2), 'utf8');
    } catch(e) {}
}

function extractSkillDescription(content) {
    if (!content) return '';
    const match = content.match(/description:\s*([^\n\r]*)/i);
    if (!match) return '';
    let val = match[1].replace(/["']/g, '').trim();
    if (val === '>' || val === '>-' || val === '|' || val === '|-' || val === '|+') {
        const lines = content.split('\n');
        const descLineIndex = lines.findIndex(l => /description:\s*[>|]/i.test(l));
        if (descLineIndex !== -1) {
            const collected = [];
            for (let i = descLineIndex + 1; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('---')) break;
                if (/^[a-zA-Z0-9_-]+:/.test(line)) break;
                if (line.startsWith('  ') || line.startsWith('\t')) {
                    const trimmed = line.trim();
                    if (trimmed) collected.push(trimmed);
                } else if (line.trim() === '') {
                    continue;
                } else {
                    break;
                }
            }
            val = collected.join(' ');
        }
    }
    return val.replace(/[*_`#]/g, '').trim();
}

console.log('🧪 Testing skills menu toggle state...');

// Test default
try { if (fs.existsSync(SKILLS_MENU_FILE)) fs.unlinkSync(SKILLS_MENU_FILE); } catch(_) {}
assert.strictEqual(isSkillsMenuEnabled(), false, 'Skills menu should default to false (OFF)');

// Test toggle ON
setSkillsMenuEnabled(true);
assert.strictEqual(isSkillsMenuEnabled(), true, 'Skills menu should be enabled when set to true');

// Test toggle OFF
setSkillsMenuEnabled(false);
assert.strictEqual(isSkillsMenuEnabled(), false, 'Skills menu should be disabled when set to false');

// Test description extraction for multiline YAML
const yamlMultilineFolded = `---
name: test-skill
description: >-
  This is a multiline
  folded description.
---`;
assert.strictEqual(extractSkillDescription(yamlMultilineFolded), 'This is a multiline folded description.');

const yamlMultilineLiteral = `---
name: test-skill-2
description: |
  **STOP AND VERIFY**: Before running tool.
---`;
assert.strictEqual(extractSkillDescription(yamlMultilineLiteral), 'STOP AND VERIFY: Before running tool.');

console.log('✅ Skills menu toggle and description tests passed!');

