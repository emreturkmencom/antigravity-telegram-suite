const ProtobufUtils = require('../src/protobuf_utils');
const assert = require('assert');

console.log('🧪 Running ProtobufUtils unit tests...');

// Test 1: Varint round-trip
const num = 1783058966;
const encoded = ProtobufUtils.encodeVarint(num);
const { value, nextOffset } = ProtobufUtils.readVarint(encoded, 0);
assert.strictEqual(Number(value), num);
console.log('✅ Test 1: Varint round-trip passed');

// Test 2: createOAuthInfo / extract fields
const token = 'test-access-token';
const refresh = 'test-refresh-token';
const expiry = 1783058966;
const email = 'test@gmail.com';

const oauthInfo = ProtobufUtils.createOAuthInfo(token, refresh, expiry, false, undefined, email);
assert(oauthInfo instanceof Uint8Array);
assert(oauthInfo.length > 0);

const accessTokenBytes = ProtobufUtils.getField(oauthInfo, 1);
assert.strictEqual(ProtobufUtils.readString(accessTokenBytes), token);

const refreshTokenBytes = ProtobufUtils.getField(oauthInfo, 3);
assert.strictEqual(ProtobufUtils.readString(refreshTokenBytes), refresh);

console.log('✅ Test 2: createOAuthInfo fields lookup passed');

// Test 3: Unified State creation
const b64 = ProtobufUtils.createUnifiedOAuthToken(token, refresh, expiry, false, undefined, email);
assert(typeof b64 === 'string');
const entries = ProtobufUtils.decodeUnifiedStateTopicEntries(Buffer.from(b64, 'base64'));
assert.strictEqual(entries.length, 1);
assert.strictEqual(entries[0].sentinelKey, 'oauthTokenInfoSentinelKey');

const parsedOAuthInfo = entries[0].payload;
const nestedAccessToken = ProtobufUtils.getField(parsedOAuthInfo, 1);
assert.strictEqual(ProtobufUtils.readString(nestedAccessToken), token);

console.log('✅ Test 3: Unified state parsing passed');

console.log('🎉 All ProtobufUtils tests passed successfully!');
