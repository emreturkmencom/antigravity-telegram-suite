const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.GOOGLE_CLIENT_ID) process.env.GOOGLE_CLIENT_ID = 'test-client-id';
if (!process.env.GOOGLE_CLIENT_SECRET) process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

const accountManager = require('../src/account_manager');

console.log('🧪 Testing OAuth scope configuration...');

// Test default scopes (no env override)
delete process.env.ANTIGRAVITY_OAUTH_SCOPES;
const defaultAuthUrl = accountManager.buildAuthUrl('http://localhost:8890/oauth-callback', 'teststate');

assert.strictEqual(defaultAuthUrl.includes('invalid_scope'), false);
assert.strictEqual(defaultAuthUrl.includes('cloud-platform'), true);
assert.strictEqual(defaultAuthUrl.includes('userinfo.email'), true);
assert.strictEqual(defaultAuthUrl.includes('userinfo.profile'), true);
assert.strictEqual(defaultAuthUrl.includes('aicode'), false, 'Default scopes should not include restricted aicode scope');

// Test custom scope override via env
process.env.ANTIGRAVITY_OAUTH_SCOPES = 'https://www.googleapis.com/auth/userinfo.email custom_scope';
const customAuthUrl = accountManager.buildAuthUrl('http://localhost:8890/oauth-callback', 'teststate');
assert.strictEqual(customAuthUrl.includes('custom_scope'), true);

delete process.env.ANTIGRAVITY_OAUTH_SCOPES;

console.log('✅ OAuth scope tests passed successfully!');
