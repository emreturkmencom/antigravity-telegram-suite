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
    return true;
}

function setSkillsMenuEnabled(enabled) {
    try {
        const dir = path.dirname(SKILLS_MENU_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SKILLS_MENU_FILE, JSON.stringify({ enabled: !!enabled }, null, 2), 'utf8');
    } catch(e) {}
}

console.log('🧪 Testing skills menu toggle state...');

// Test toggle OFF
setSkillsMenuEnabled(false);
assert.strictEqual(isSkillsMenuEnabled(), false, 'Skills menu should be disabled when set to false');

// Test toggle ON
setSkillsMenuEnabled(true);
assert.strictEqual(isSkillsMenuEnabled(), true, 'Skills menu should be enabled when set to true');

console.log('✅ Skills menu toggle tests passed!');
