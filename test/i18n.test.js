const assert = require('assert');
const { loadLocale, t, getLang } = require('../src/i18n');

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

// Test fallback / missing
const missing = t('this.key.does.not.exist');
assert.strictEqual(missing, 'this.key.does.not.exist', 'Missing key should return the key itself');

console.log('✅ All i18n tests passed successfully!');
