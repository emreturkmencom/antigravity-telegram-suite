const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('🧪 Running chat_mode unit tests...');

let isChatModeActive = false;

function toggleChatMode(state) {
    if (typeof state === 'boolean') {
        isChatModeActive = state;
    } else {
        isChatModeActive = !isChatModeActive;
    }
    return isChatModeActive;
}

function processPrompt(prompt) {
    let finalQuery = prompt;
    if (isChatModeActive) {
        finalQuery = "[SYSTEM INSTRUCTION: CHAT/PLANNING MODE IS ACTIVE. YOU MUST NOT CREATE, EDIT, DELETE, OR MODIFY ANY FILES OR CODE. DISCUSS, EXPLAIN, PLAN, AND ANSWER THE USER'S QUERY DIRECTLY IN CHAT ONLY.]\n\n" + prompt;
    }
    return finalQuery;
}

// Test 1: Initially disabled
assert.strictEqual(isChatModeActive, false);
assert.strictEqual(processPrompt('How does the router work?'), 'How does the router work?');

// Test 2: Enable chat mode
toggleChatMode(true);
assert.strictEqual(isChatModeActive, true);
const formatted = processPrompt('How does the router work?');
assert.ok(formatted.includes('CHAT/PLANNING MODE IS ACTIVE'));
assert.ok(formatted.includes('YOU MUST NOT CREATE, EDIT, DELETE, OR MODIFY ANY FILES OR CODE'));

// Test 3: Reset chat mode (/new)
toggleChatMode(false);
assert.strictEqual(isChatModeActive, false);
assert.strictEqual(processPrompt('Refactor index.js'), 'Refactor index.js');

console.log('✅ All chat_mode unit tests passed!');
