const fs = require('fs');
const path = require('path');
const os = require('os');
const telegraph = require('../src/telegraph_publisher');

function printResult(name, passed, message) {
    if (passed) {
        console.log(`  ✅ ${name}`);
    } else {
        console.error(`  ❌ ${name}: ${message || 'FAILED'}`);
    }
}

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

    const nodes = telegraph.mdToNodes(sampleMd);
    
    // Assert heading nodes
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
    if (!items.some(i => typeof i === 'string' && i.startsWith('⬜'))) {
        throw new Error('Expected checkbox empty indicator (⬜)');
    }
    if (!items.some(i => typeof i === 'string' && i.startsWith('✅'))) {
        throw new Error('Expected checkbox checked indicator (✅)');
    }
    if (!items.some(i => typeof i === 'string' && i.startsWith('⏳'))) {
        throw new Error('Expected checkbox pending indicator (⏳)');
    }

    printResult('testMarkdownParsing', true);
}

async function testTelegraphDisabledByDefault() {
    const tempFile = path.join(os.tmpdir(), `test-telegraph-disabled-${Date.now()}.md`);
    const prevEnv = process.env.ENABLE_TELEGRAPH;
    try {
        delete process.env.ENABLE_TELEGRAPH;
        fs.writeFileSync(tempFile, '# Test Content', 'utf-8');

        // 1. isTelegraphEnabled() should return false
        if (telegraph.isTelegraphEnabled() !== false) {
            throw new Error(`Expected isTelegraphEnabled() to be false, got: ${telegraph.isTelegraphEnabled()}`);
        }

        // 2. publishOrUpdateArtifact() should return null without making any requests
        const url = await telegraph.publishOrUpdateArtifact(tempFile, 'Disabled Test');
        if (url !== null) {
            throw new Error(`Expected null when ENABLE_TELEGRAPH is not set, got: ${url}`);
        }

        // 3. getPageMapping() should return null
        const mapping = telegraph.getPageMapping(tempFile);
        if (mapping !== null) {
            throw new Error(`Expected null mapping when ENABLE_TELEGRAPH is not set, got: ${mapping}`);
        }

        printResult('testTelegraphDisabledByDefault', true);
    } finally {
        if (prevEnv !== undefined) {
            process.env.ENABLE_TELEGRAPH = prevEnv;
        } else {
            delete process.env.ENABLE_TELEGRAPH;
        }
        try { fs.unlinkSync(tempFile); } catch (_) {}
    }
}

async function testTelegraphPublishAndEdit() {
    const tempFile = path.join(os.tmpdir(), `test-telegraph-${Date.now()}.md`);
    const prevEnv = process.env.ENABLE_TELEGRAPH;
    try {
        process.env.ENABLE_TELEGRAPH = 'true';
        fs.writeFileSync(tempFile, '# Telegraph Test\n\nThis is the initial version.', 'utf-8');

        // 1. Test publish - creates page with unguessable hex slug
        const url1 = await telegraph.publishOrUpdateArtifact(tempFile, 'Telegraph Integration Test');
        if (!url1 || (!url1.startsWith('https://telegra.ph/') && !url1.startsWith('https://graph.org/'))) {
            throw new Error(`Invalid URL returned: ${url1}`);
        }

        // Slug should start with a 32-char hex string (e.g. https://graph.org/<32-hex>-MM-DD)
        const slugMatch = url1.match(/https:\/\/(?:telegra\.ph|graph\.org)\/([a-f0-9]{32})/i);
        if (!slugMatch) {
            console.warn(`[testTelegraphPublishAndEdit] Warning: URL slug did not match expected 32-hex format: ${url1}`);
        }

        console.log(`Successfully created page: ${url1}`);

        // 2. Test edit/update - page is updated and returns identical URL
        fs.writeFileSync(tempFile, '# Telegraph Test\n\nThis is the **updated** version.', 'utf-8');
        const url2 = await telegraph.publishOrUpdateArtifact(tempFile, 'Telegraph Integration Test');
        if (url1 !== url2) {
            throw new Error(`Expected URL to stay the same on update, got: ${url2} vs ${url1}`);
        }
        console.log(`Successfully updated page: ${url2}`);

        printResult('testTelegraphPublishAndEdit', true);
    } finally {
        if (prevEnv !== undefined) {
            process.env.ENABLE_TELEGRAPH = prevEnv;
        } else {
            delete process.env.ENABLE_TELEGRAPH;
        }
        try { fs.unlinkSync(tempFile); } catch (_) {}
    }
}

async function runAll() {
    console.log('Starting Telegraph tests...');
    let failures = 0;

    const tests = [
        { name: 'testMarkdownParsing', fn: testMarkdownParsing },
        { name: 'testTelegraphDisabledByDefault', fn: testTelegraphDisabledByDefault },
        { name: 'testTelegraphPublishAndEdit', fn: testTelegraphPublishAndEdit }
    ];

    for (const test of tests) {
        try {
            await test.fn();
        } catch (e) {
            printResult(test.name, false, e.stack);
            failures++;
        }
    }

    if (failures > 0) {
        process.exit(1);
    }
}

runAll();
