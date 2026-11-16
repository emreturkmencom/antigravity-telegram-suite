const assert = require('assert');
const { JSDOM } = require('jsdom');
const { loadLocale } = require('../src/i18n');
const {
    PROJECT_THREADS_PAGE_SIZE,
    TOP_PINNED_LIMIT,
    TOP_RECENT_LIMIT,
    MAIN_WORKSPACES_LIMIT,
    renderAgentsKeyboard,
    renderProjectThreadsKeyboard,
} = require('../src/agents_menu');
const StandaloneDriver = require('../src/drivers/standalone_driver');

async function runTests() {
    console.log('🧪 Running /agents menu & Redux thread extraction tests...');
    loadLocale('en');

    // 1. Main /agents layout: Top 5 Pinned + Top 5 Recent (no duplicates, chronological) + 12-workspace cap
    const now = Date.now();
    const workspaces = [];
    const cached = [];

    for (let w = 0; w < 15; w++) {
        const wsName = `proj-${w + 1}`;
        const threads = [];
        for (let tIdx = 0; tIdx < 3; tIdx++) {
            const id = `00000000-0000-0000-0000-${String(w * 10 + tIdx).padStart(12, '0')}`;
            const updatedAt = now - (w * 3 + tIdx) * 60000;
            const pinned = w < 6 && tIdx === 0; // 6 pinned items across workspaces
            const th = {
                name: `Chat ${w + 1}-${tIdx + 1}`,
                threadId: id,
                time: `${w * 3 + tIdx + 1}m`,
                updatedAt,
                pinned,
                workspace: wsName,
            };
            threads.push(th);
            cached.push(th);
        }
        workspaces.push({ workspace: wsName, threads });
    }

    const activeInfo = {
        name: 'Chat 1-1',
        workspace: 'proj-1',
        threadId: '00000000-0000-0000-0000-000000000000',
    };

    const mainView = renderAgentsKeyboard(workspaces, activeInfo, cached);
    const rows = mainView.reply_markup.inline_keyboard;
    const flatButtons = rows.flat();

    const pinnedButtons = flatButtons.filter(b => b.callback_data.startsWith('ag_th:') && b.text.startsWith('📌 '));
    const recentButtons = flatButtons.filter(b => b.callback_data.startsWith('ag_th:') && b.text.startsWith('💬 '));
    const wsButtons = flatButtons.filter(b => b.text.startsWith('📁 '));

    assert.strictEqual(pinnedButtons.length, TOP_PINNED_LIMIT, 'Should show at most 5 pinned chats');
    assert.strictEqual(recentButtons.length, TOP_RECENT_LIMIT, 'Should show 5 recent non-duplicate chats');
    assert(pinnedButtons[0].text.includes('· proj-1 (1m)'), `Pinned button should include project and time, got: ${pinnedButtons[0].text}`);
    assert(recentButtons[0].text.includes('Chat 1-2 · proj-1 (2m)'), `Top recent should skip already-shown pinned Chat 1-1 and pick newest remaining Chat 1-2, got: ${recentButtons[0].text}`);

    // Ensure zero overlap between pinned callback_data and recent callback_data
    const pinnedCbs = new Set(pinnedButtons.map(b => b.callback_data));
    for (const rb of recentButtons) {
        assert(!pinnedCbs.has(rb.callback_data), `Duplicate chat in recent list: ${rb.text}`);
    }

    assert.strictEqual(wsButtons.length, MAIN_WORKSPACES_LIMIT, 'Initial view should cap workspaces at 12');
    assert(flatButtons.some(b => b.callback_data === 'ag_ws_all'), 'Should render Show All Projects button when >12 workspaces exist');
    assert(flatButtons.some(b => b.callback_data === 'ag_rn_active'), 'Should render Rename Active Chat button');
    const activePinBtn = flatButtons.find(b => b.callback_data === 'ag_pin_active');
    assert(activePinBtn && activePinBtn.text.includes('Unpin'), `Pinned active chat should show Unpin button, got: ${activePinBtn?.text}`);

    // Unpinned active chat should show Pin button
    const unpinnedActiveView = renderAgentsKeyboard(workspaces, {
        name: 'Chat 1-2',
        workspace: 'proj-1',
        threadId: '00000000-0000-0000-0000-000000000001',
    }, cached);
    const unpinnedPinBtn = unpinnedActiveView.reply_markup.inline_keyboard.flat().find(b => b.callback_data === 'ag_pin_active');
    assert(unpinnedPinBtn && unpinnedPinBtn.text.includes('Pin') && !unpinnedPinBtn.text.includes('Unpin'), `Unpinned active chat should show Pin button, got: ${unpinnedPinBtn?.text}`);

    const expandedView = renderAgentsKeyboard(workspaces, activeInfo, cached, { showAllWorkspaces: true });
    const expandedWsButtons = expandedView.reply_markup.inline_keyboard.flat().filter(b => b.text.startsWith('📁 '));
    assert.strictEqual(expandedWsButtons.length, 15, 'Expanded view should show all 15 workspaces');
    console.log('  ✅ Main /agents Top 5 Pinned + Top 5 Recent + 12-workspace cap passed');

    // 2. Project view: max 10 chats per page + pagination + rename picker mode
    const bigWsThreads = [];
    for (let i = 0; i < 24; i++) {
        const th = {
            name: `Feature Task ${i + 1}`,
            threadId: `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`,
            time: `${i + 1}h`,
            updatedAt: now - i * 3600000,
            pinned: i === 2,
            workspace: 'big-proj',
        };
        bigWsThreads.push(th);
        cached.push(th);
    }
    const bigWs = { workspace: 'big-proj', threads: bigWsThreads };

    const page0 = renderProjectThreadsKeyboard(bigWs, 0, cached, 0, false);
    const page0ChatBtns = page0.reply_markup.inline_keyboard.flat().filter(b => b.callback_data.startsWith('ag_th:'));
    assert.strictEqual(page0ChatBtns.length, PROJECT_THREADS_PAGE_SIZE, 'Project page 0 must show max 10 chats');
    assert(page0ChatBtns[0].text.includes('Feature Task 1 (1h)'), 'Page 0 must be sorted newest-first with time');
    assert(page0ChatBtns[2].text.startsWith('📌 '), 'Pinned chat inside project view should show 📌 icon');
    assert(page0.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'ag_wsp:0:1'), 'Page 0 should include Next button');
    assert(page0.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'ag_rnp:0:0'), 'Page 0 should include Rename a Chat button');
    assert(page0.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'ag_pnp:0:0'), 'Page 0 should include Pin / Unpin button');

    const page2 = renderProjectThreadsKeyboard(bigWs, 0, cached, 2, false);
    const page2ChatBtns = page2.reply_markup.inline_keyboard.flat().filter(b => b.callback_data.startsWith('ag_th:'));
    assert.strictEqual(page2ChatBtns.length, 4, 'Last page of 24 items should have 4 items');

    const renamePicker = renderProjectThreadsKeyboard(bigWs, 0, cached, 1, 'rename');
    const renameBtns = renamePicker.reply_markup.inline_keyboard.flat().filter(b => b.callback_data.startsWith('ag_rn:'));
    assert.strictEqual(renameBtns.length, 10, 'Rename picker mode on page 1 must show 10 ✏️ rename buttons');
    assert(renameBtns[0].text.startsWith('✏️ Feature Task 11 (11h)'), `Unexpected rename button label: ${renameBtns[0].text}`);

    const pinPicker = renderProjectThreadsKeyboard(bigWs, 0, cached, 0, 'pin');
    const pinBtns = pinPicker.reply_markup.inline_keyboard.flat().filter(b => b.callback_data.startsWith('ag_pn:0:0:'));
    assert.strictEqual(pinBtns.length, 10, 'Pin picker mode on page 0 must show 10 toggle buttons');
    assert(pinBtns[0].text.startsWith('▫️ Feature Task 1 (1h)'), `Unpinned item in pin picker should show ▫️, got: ${pinBtns[0].text}`);
    assert(pinBtns[2].text.startsWith('📌 Feature Task 3 (3h)'), `Pinned item in pin picker should show 📌, got: ${pinBtns[2].text}`);
    console.log('  ✅ Project max-10 pagination, rename picker & pin/unpin picker modes passed');

    // 3. StandaloneDriver Redux fast-path script (filters archived, 0-step empty, and wo-* desks; sorts by updatedAt)
    const dom = new JSDOM('<!DOCTYPE html><body><div id="root"></div></body>', { runScripts: 'dangerously' });
    const nowSec = Math.floor(Date.now() / 1000);
    const mockReduxState = {
        trajectorySummaries: {
            summaries: {
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1': {
                    summary: 'Older Pinned Chat',
                    stepCount: 12,
                    lastModifiedTime: { seconds: BigInt(nowSec - 7200), nanos: 0 },
                    workspaces: [{ workspaceFolderAbsoluteUri: 'file:///home/me/Projects/app-one' }],
                    annotations: { title: 'Older Pinned Custom Name', pinned: true, archived: false },
                },
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2': {
                    summary: 'Brand New Chat',
                    stepCount: 5,
                    lastModifiedTime: { seconds: BigInt(nowSec - 120), nanos: 0 },
                    workspaces: [{ workspaceFolderAbsoluteUri: 'file:///home/me/Projects/app-two' }],
                    annotations: { pinned: false, archived: false },
                },
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3': {
                    summary: '',
                    stepCount: 8,
                    lastModifiedTime: { seconds: BigInt(nowSec - 600), nanos: 0 },
                    workspaces: [{ workspaceFolderAbsoluteUri: 'file:///home/me/Projects/app-one' }],
                    annotations: { pinned: false, archived: false },
                },
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4': {
                    summary: '',
                    stepCount: 0,
                    lastModifiedTime: { seconds: BigInt(nowSec - 30), nanos: 0 },
                    workspaces: [{ workspaceFolderAbsoluteUri: 'file:///home/me/Projects/app-one' }],
                    annotations: {},
                },
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5': {
                    summary: 'Archived Chat',
                    stepCount: 20,
                    lastModifiedTime: { seconds: BigInt(nowSec - 10), nanos: 0 },
                    workspaces: [{ workspaceFolderAbsoluteUri: 'file:///home/me/Projects/app-two' }],
                    annotations: { archived: true },
                },
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6': {
                    summary: 'AGTS Work Order Run',
                    stepCount: 15,
                    lastModifiedTime: { seconds: BigInt(nowSec - 5), nanos: 0 },
                    workspaces: [{ workspaceFolderAbsoluteUri: 'file:///home/me/Projects/.agts-work-orders/desks/wo-qa' }],
                    annotations: {},
                },
            },
        },
    };
    const rootEl = dom.window.document.getElementById('root');
    rootEl.__reactContainer$mock = {
        memoizedProps: {
            value: {
                store: { getState: () => mockReduxState },
            },
        },
    };

    const driver = new StandaloneDriver();
    const rawJson = await dom.window.eval(driver.getListAgentThreadsScript());
    const extracted = JSON.parse(rawJson);

    assert.strictEqual(extracted.length, 2, 'Should extract 2 user workspaces and exclude wo-qa desk & archived');
    assert.strictEqual(extracted[0].workspace, 'app-two', 'Newest workspace app-two should be sorted first');
    assert.strictEqual(extracted[0].threads.length, 1);
    assert.strictEqual(extracted[0].threads[0].name, 'Brand New Chat');
    assert.strictEqual(extracted[0].threads[0].time, '2m');

    assert.strictEqual(extracted[1].workspace, 'app-one');
    assert.strictEqual(extracted[1].threads.length, 2, 'Should exclude 0-step empty thread but keep non-empty untitled thread');
    assert.strictEqual(extracted[1].threads[0].name, 'Untitled Conversation');
    assert.strictEqual(extracted[1].threads[1].name, 'Older Pinned Custom Name');
    assert.strictEqual(extracted[1].threads[1].pinned, true);
    console.log('  ✅ StandaloneDriver Redux store fast-path extraction & filtering passed');

    console.log('✅ All /agents menu & Redux thread extraction tests passed!');
}

runTests().catch((err) => {
    console.error('❌ agents_menu test failed:', err);
    process.exit(1);
});
