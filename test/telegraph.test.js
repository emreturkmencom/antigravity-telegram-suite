const fs = require('fs');
const path = require('path');
const os = require('os');
const { printResult } = require('./test_helpers');
const telegraph = require('../src/telegraph_publisher');

async function testMarkdownParsing() {
    const sampleMd = `
# Plan for implementation

Here is the description of the plan.

## Proposed Changes
- [ ] First task
- [x] Completed task
- [/] In progress task

> [!IMPORTANT]
> Note that this is critical.

Here is a link: [Google](https://google.com) and some **bold text** and \`code\`.
    `.trim();

    try {
        const nodes = telegraph.mdToNodes(sampleMd);
        
        // Assert some node shapes
        const h3Node = nodes.find(n => n.tag === 'h3');
        if (!h3Node || h3Node.children[0] !== 'Plan for implementation') {
            throw new Error(`Expected h3 header, got: ${JSON.stringify(h3Node)}`);
        }

        const blockquoteNode = nodes.find(n => n.tag === 'blockquote');
        if (!blockquoteNode) {
            throw new Error('Expected blockquote node');
        }

        // Find checkbox emojis
        const ulNode = nodes.find(n => n.tag === 'ul');
        if (!ulNode || ulNode.children.length !== 3) {
            throw new Error('Expected ul with 3 items');
        }

        const items = ulNode.children.map(li => li.children[0]);
        if (!items.includes('☐ ') && !items.some(i => i.startsWith('☐'))) {
            throw new Error('Expected checkbox empty indicator');
        }
        if (!items.some(i => i.startsWith('☑'))) {
            throw new Error('Expected checkbox checked indicator');
        }
        if (!items.some(i => i.startsWith('⏳'))) {
            throw new Error('Expected checkbox pending indicator');
        }

        printResult('testMarkdownParsing', true);
    } catch (e) {
        printResult('testMarkdownParsing', false, e.stack);
    }
}

async function testTelegraphPublishAndEdit() {
    const tempFile = path.join(os.tmpdir(), `test-telegraph-${Date.now()}.md`);
    try {
        fs.writeFileSync(tempFile, '# Telegraph Test\n\nThis is the initial version.', 'utf-8');

        // 1. Test publish
        const url1 = await telegraph.publishOrUpdateArtifact(tempFile, 'Telegraph Integration Test');
        if (!url1 || (!url1.startsWith('https://telegra.ph/') && !url1.startsWith('https://graph.org/'))) {
            throw new Error(`Invalid URL returned: ${url1}`);
        }
        console.log(`Successfully created page: ${url1}`);

        // 2. Test edit/update
        fs.writeFileSync(tempFile, '# Telegraph Test\n\nThis is the **updated** version.', 'utf-8');
        const url2 = await telegraph.publishOrUpdateArtifact(tempFile, 'Telegraph Integration Test');
        if (url1 !== url2) {
            throw new Error(`Expected URL to stay the same on update, got: ${url2} vs ${url1}`);
        }
        console.log(`Successfully updated page: ${url2}`);

        printResult('testTelegraphPublishAndEdit', true);
    } catch (e) {
        printResult('testTelegraphPublishAndEdit', false, e.stack);
    } finally {
        try { fs.unlinkSync(tempFile); } catch (_) {}
    }
}

async function runAll() {
    console.log('Starting Telegraph tests...');
    await testMarkdownParsing();
    await testTelegraphPublishAndEdit();
}

runAll();
