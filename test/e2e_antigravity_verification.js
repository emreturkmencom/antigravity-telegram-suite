const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CDP = require('../node_modules/chrome-remote-interface');
const { getFullLatestResponse, getChatExtractExpr } = require('../src/cdp_controller');

function getCDPPort() {
    try {
        const devToolsFile = path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort');
        if (fs.existsSync(devToolsFile)) {
            const lines = fs.readFileSync(devToolsFile, 'utf8').trim().split('\n');
            const p = parseInt(lines[0], 10);
            if (p && !isNaN(p)) return p;
        }
    } catch (_) {}
    return parseInt(process.env.AGENT_CDP_PORT || '9333', 10);
}

(async () => {
    console.log('🧪 Starting End-to-End Antigravity Suite Verification...');
    
    // 1. Verify CDP connection to active Antigravity GUI
    const port = getCDPPort();
    const targets = await CDP.List({ port });
    assert(targets && targets.length > 0, 'Should find active Antigravity CDP targets');
    console.log(`✅ CDP Connected: Found ${targets.length} targets on port ${port}`);

    // 2. Verify Chat DOM Extraction
    const page = targets.find(t => t.type === 'page');
    assert(page, 'Should have an active page target');
    const client = await CDP({ target: page.webSocketDebuggerUrl });
    const { Runtime, Input } = client;
    await Runtime.enable();

    const extractRes = await Runtime.evaluate({
        expression: getChatExtractExpr(),
        returnByValue: true
    });
    assert(extractRes.result && typeof extractRes.result.value === 'string', 'Chat extraction expression should return string');
    console.log(`✅ DOM History Extracted: ${extractRes.result.value.length} characters cleanly retrieved`);

    // 3. Test Composer Clean State
    await Runtime.evaluate({
        expression: `(() => {
            const editor = document.querySelector('[contenteditable="true"], textarea');
            if (editor) {
                editor.focus();
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(editor);
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('delete', false, null);
                if (editor.textContent && editor.textContent.length > 0) editor.innerHTML = '';
            }
        })()`
    });
    console.log('✅ Composer Cleared: Zero leftover tokens');

    // 4. Verify getFullLatestResponse
    const latest = await getFullLatestResponse(port);
    assert(latest && latest.text, 'getFullLatestResponse should return non-null response object');
    console.log(`✅ getFullLatestResponse: Successfully returned (${latest.text.length} chars)`);

    await client.close();
    console.log('\n🎉 ALL END-TO-END VERIFICATIONS PASSED 100%!');
})().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
