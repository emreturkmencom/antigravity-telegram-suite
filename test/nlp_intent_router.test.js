const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { classifyIntent, inspectWorkspaceTasks } = require('../src/nlp_intent_router');

console.log('🧪 Running nlp_intent_router unit tests...');

// Test 1: COMMAND_SUGGESTION classification
const test1 = classifyIntent('How can I check my quota?');
assert.strictEqual(test1.intent, 'COMMAND_SUGGESTION');
assert.deepStrictEqual(test1.matchedCommands, ['quota']);

// Test 2: PROJECT_TODO_QUERY classification
const test2 = classifyIntent('What tasks are left in todo?');
assert.strictEqual(test2.intent, 'PROJECT_TODO_QUERY');

// Test 3: AGENT_PROMPT classification
const test3 = classifyIntent('Write a function to format dates in utils.js');
assert.strictEqual(test3.intent, 'AGENT_PROMPT');

// Test 4: Workspace Task Inspection (with temp dir)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp_test_'));
const todoDir = path.join(tmpDir, 'TODO');
const todoDoneDir = path.join(tmpDir, 'TODO_DONE');
fs.mkdirSync(todoDir);
fs.mkdirSync(todoDoneDir);
fs.writeFileSync(path.join(todoDir, '01_feature.txt'), 'Add feature X');
fs.writeFileSync(path.join(todoDoneDir, '00_init.txt'), 'Init repo');

const inspection = inspectWorkspaceTasks(tmpDir);
assert.strictEqual(inspection.hasTaskData, true);
assert.strictEqual(inspection.todoItems.length, 1);
assert.strictEqual(inspection.todoDoneItems.length, 1);

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('✅ All nlp_intent_router unit tests passed!');
