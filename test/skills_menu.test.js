const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

console.log('🧪 Testing skills menu...');

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

const yamlInline = `---
name: test-skill-3
description: "Simple inline description"
---`;
assert.strictEqual(extractSkillDescription(yamlInline), 'Simple inline description');

const yamlEmpty = `---
name: no-desc
---`;
assert.strictEqual(extractSkillDescription(yamlEmpty), '');

// Test i18n skills keys exist in all locales
const LOCALES = ['en', 'tr', 'de', 'es', 'fr', 'ko', 'zh'];
const REQUIRED_SKILLS_KEYS = ['menu_title', 'category_title', 'search_results', 'not_found', 'no_skills', 'running', 'close_btn', 'back_btn', 'refresh_btn'];

for (const lang of LOCALES) {
    const filePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    assert.ok(data.skills, `Locale ${lang} is missing 'skills' section`);
    for (const key of REQUIRED_SKILLS_KEYS) {
        assert.ok(data.skills[key], `Locale ${lang} is missing 'skills.${key}'`);
    }
    
    // Verify help.agent_text no longer references /toggleskill
    if (data.help && data.help.agent_text) {
        assert.ok(!data.help.agent_text.includes('/toggleskill'), `Locale ${lang} help still references /toggleskill`);
        assert.ok(data.help.agent_text.includes('/skill'), `Locale ${lang} help should reference /skill`);
    }
}

console.log('✅ All skills menu tests passed!');
