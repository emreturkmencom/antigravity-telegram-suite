const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadLocale, t, getLang } = require('../src/i18n');

function collectKeys(obj, prefix = '') {
    return Object.entries(obj).flatMap(([key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return collectKeys(value, fullKey);
        }
        return [fullKey];
    });
}

// Test English
loadLocale('en');
assert.strictEqual(getLang(), 'en', 'Language should be set to en');
assert.strictEqual(t('status.running_status'), '🟢 RUNNING', 'English translation failed');
assert.strictEqual(t('agent.swipe_to_reply'), '<i>(Swipe message to the left to reply to this agent)</i>', 'English swipe text failed');

// Test Turkish
loadLocale('tr');
assert.strictEqual(getLang(), 'tr', 'Language should be set to tr');
assert.strictEqual(t('status.running_status'), '🟢 ÇALIŞIYOR', 'Turkish translation failed');
assert.strictEqual(t('agent.swipe_to_reply'), '<i>(Bu ajanı yanıtlamak için mesajı sola kaydırın)</i>', 'Turkish swipe text failed');

// Test Chinese
loadLocale('zh');
assert.strictEqual(getLang(), 'zh', 'Language should be set to zh');
assert.strictEqual(t('status.running_status'), '🟢 运行中', 'Chinese translation failed');
assert.strictEqual(t('menu.lang_desc'), '切换语言', 'Chinese menu text failed');
assert.strictEqual(t('agent.swipe_to_reply'), '<i>（向左滑动消息即可回复此 Agent）</i>', 'Chinese swipe text failed');

const enLocale = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'en.json'), 'utf8'));
const zhLocale = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'zh.json'), 'utf8'));
assert.deepStrictEqual(
    collectKeys(zhLocale).sort(),
    collectKeys(enLocale).sort(),
    'Chinese locale keys should match English locale keys'
);

// Test fallback / missing
const missing = t('this.key.does.not.exist');
assert.strictEqual(missing, 'this.key.does.not.exist', 'Missing key should return the key itself');

console.log('✅ All i18n tests passed successfully!');

// Test new strings
loadLocale('en');
assert.strictEqual(t('app.error_save'), 'Error: Could not save preference.', 'English error_save missing');
loadLocale('tr');
assert.strictEqual(t('app.error_save'), 'Hata: Tercih kaydedilemedi.', 'Turkish error_save missing');
