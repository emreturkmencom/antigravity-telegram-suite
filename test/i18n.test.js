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

// Test Korean
loadLocale('ko');
assert.strictEqual(getLang(), 'ko', 'Language should be set to ko');
assert.strictEqual(t('status.running_status'), '🟢 실행 중', 'Korean translation failed');
assert.strictEqual(t('agent.swipe_to_reply'), '<i>(이 에이전트에 답장하려면 메시지를 왼쪽으로 스와이프하세요)</i>', 'Korean swipe text failed');

// Test fallback / missing
const missing = t('this.key.does.not.exist');
assert.strictEqual(missing, 'this.key.does.not.exist', 'Missing key should return the key itself');

console.log('✅ All i18n tests passed successfully!');

// Test new strings
loadLocale('en');
assert.strictEqual(t('app.error_save'), 'Error: Could not save preference.', 'English error_save missing');
loadLocale('tr');
assert.strictEqual(t('app.error_save'), 'Hata: Tercih kaydedilemedi.', 'Turkish error_save missing');
loadLocale('ko');
assert.strictEqual(t('app.error_save'), '오류: 선호 설정을 저장할 수 없습니다.', 'Korean error_save missing');
