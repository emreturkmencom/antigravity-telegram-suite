const assert = require('assert');
const http = require('http');

async function startFakeCDPServer(targetsFn) {
    const server = http.createServer((req, res) => {
        if (req.url === '/json') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(targetsFn()));
            return;
        }
        res.writeHead(404);
        res.end();
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return {
        port: server.address().port,
        close: () => new Promise(r => server.close(r)),
    };
}

async function runTests() {
    console.log('🧪 Running Antigravity IDE 2.6+ integration tests...');

    const prevApp = process.env.ANTIGRAVITY_PREFERRED_APP;
    process.env.ANTIGRAVITY_PREFERRED_APP = 'ide';

    const {
        resolveTargets,
        listWindows,
        setPreferredWindow,
        setActiveWorkspace,
        getSelectableSlashCommandForTarget,
    } = require('../src/cdp_controller');
    const DriverFactory = require('../src/drivers');
    const { buildIDEObserverScript } = require('../src/autoaccept/ide_autoaccept');

    try {
        // 1. Multi-window IDE 2.6+ target graph: page -> outer vscode-webview -> inner extensionView + settings tab
        const fakeTargets = [
            {
                id: 'WIN_A',
                type: 'page',
                title: 'alpha-proj - Antigravity IDE - index.js',
                url: 'vscode-file://vscode-app/opt/antigravity-ide/workbench.html',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/WIN_A',
            },
            {
                id: 'OUTER_A',
                parentId: 'WIN_A',
                type: 'iframe',
                title: 'vscode-webview://abc/index.html',
                url: 'vscode-webview://abc/index.html?purpose=webviewView',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/OUTER_A',
            },
            {
                id: 'PANEL_A',
                parentId: 'OUTER_A',
                type: 'iframe',
                title: 'http://127.0.0.1:41001/?extensionView=true',
                url: 'http://127.0.0.1:41001/?extensionView=true&workspaceUri=file%3A%2F%2F%2Fhome%2Fuser%2FProjects%2Falpha-proj',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/PANEL_A',
            },
            {
                id: 'SETTINGS_A',
                parentId: 'OUTER_A',
                type: 'iframe',
                title: 'http://127.0.0.1:41001/settings-standalone?extensionView=true',
                url: 'http://127.0.0.1:41001/settings-standalone?extensionView=true&targetScreen=General',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/SETTINGS_A',
            },
            {
                id: 'WIN_B',
                type: 'page',
                title: 'wo-beta - Antigravity IDE',
                url: 'vscode-file://vscode-app/opt/antigravity-ide/workbench.html',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/WIN_B',
            },
            {
                id: 'OUTER_B',
                parentId: 'WIN_B',
                type: 'iframe',
                title: 'vscode-webview://def/index.html',
                url: 'vscode-webview://def/index.html?purpose=webviewView',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/OUTER_B',
            },
            {
                id: 'PANEL_B',
                parentId: 'OUTER_B',
                type: 'iframe',
                title: 'http://127.0.0.1:41002/c/11111111-2222-3333-4444-555555555555?extensionView=true',
                url: 'http://127.0.0.1:41002/c/11111111-2222-3333-4444-555555555555?extensionView=true&workspaceUri=file%3A%2F%2F%2Fhome%2Fuser%2FProjects%2F.agts-work-orders%2Fdesks%2Fwo-beta',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/PANEL_B',
            },
            {
                id: 'SPLASH_DATA',
                type: 'page',
                title: 'data:text/html,splash',
                url: 'data:text/html,<html></html>',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/SPLASH_DATA',
            },
            {
                id: 'SWARM_PLUGIN',
                parentId: 'PANEL_B',
                type: 'iframe',
                title: 'plugin://swarm',
                url: 'plugin://swarm--swarm_board/',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/SWARM_PLUGIN',
            },
        ];

        const srv = await startFakeCDPServer(() => JSON.parse(JSON.stringify(fakeTargets)));
        const prevRunnerFlag = process.env.WORK_ORDERS_RUNNER;
        delete process.env.WORK_ORDERS_RUNNER;
        try {
            setPreferredWindow(null);
            setActiveWorkspace(null);

            const { deskNameFromTarget, isDeskTarget } = require('../src/work_orders/desks');
            assert.strictEqual(deskNameFromTarget({ workspaceName: 'wo-beta' }), 'beta');
            assert.strictEqual(deskNameFromTarget({ title: 'wo-qa-1 - Antigravity IDE' }), 'qa-1');
            assert.strictEqual(isDeskTarget({ workspaceName: 'alpha-proj', title: 'alpha-proj - Antigravity IDE - wo-notes.md' }), false);

            // listWindows returns all real top-level IDE windows (including desks so /window can select them)
            const wins = await listWindows(srv.port);
            assert.deepStrictEqual(wins.map(w => w.id), ['WIN_A', 'WIN_B']);

            // In main bot process (no WORK_ORDERS_RUNNER), automatic resolveTargets excludes wo-<desk> windows/panels
            const resolvedMain = await resolveTargets(srv.port, true);
            assert.deepStrictEqual(resolvedMain.map(t => t.id), ['PANEL_A', 'WIN_A']);
            assert.strictEqual(resolvedMain[0].windowId, 'WIN_A');
            assert.strictEqual(resolvedMain[0].workspaceName, 'alpha-proj');

            // Even if ONLY desk targets exist (no non-desk IDE window open), main bot must NOT fall back to a desk
            const deskOnlyTargets = fakeTargets.filter(t => ['WIN_B', 'OUTER_B', 'PANEL_B'].includes(t.id));
            const deskOnlySrv = await startFakeCDPServer(() => JSON.parse(JSON.stringify(deskOnlyTargets)));
            try {
                const resolvedDeskOnly = await resolveTargets(deskOnlySrv.port, true);
                assert.deepStrictEqual(resolvedDeskOnly, [], 'Main bot must not fall back to desk targets when no normal window is open');
            } finally {
                await deskOnlySrv.close();
            }

            // With WORK_ORDERS_RUNNER=1, runner sees desk targets as well
            process.env.WORK_ORDERS_RUNNER = '1';
            const resolvedRunner = await resolveTargets(srv.port, true);
            assert.deepStrictEqual(resolvedRunner.map(t => t.id), ['PANEL_A', 'PANEL_B', 'WIN_A', 'WIN_B']);
            assert.strictEqual(resolvedRunner[1].windowId, 'WIN_B');
            assert.strictEqual(resolvedRunner[1].workspaceName, 'wo-beta');
            delete process.env.WORK_ORDERS_RUNNER;

            // Selecting Window B via /window (preferredTargetId) explicitly allows routing to that desk window's PANEL_B
            setPreferredWindow('WIN_B');
            const byWinB = await resolveTargets(srv.port, true);
            assert.strictEqual(byWinB[0].id, 'PANEL_B');
            assert.strictEqual(byWinB[1].id, 'WIN_B');

            // Workspace routing prioritizes matching window's agent panel when explicitly set
            setPreferredWindow(null);
            setActiveWorkspace('wo-beta');
            const byWs = await resolveTargets(srv.port, true);
            assert.strictEqual(byWs[0].id, 'PANEL_B');

            setActiveWorkspace(null);
            console.log('  ✅ Target graph resolution, desk exclusion in main bot, and runner visibility passed');
        } finally {
            if (prevRunnerFlag === undefined) delete process.env.WORK_ORDERS_RUNNER;
            else process.env.WORK_ORDERS_RUNNER = prevRunnerFlag;
            setPreferredWindow(null);
            setActiveWorkspace(null);
            await srv.close();
        }

        // 2. Slash command support in IDE 2.6+ extensionView vs legacy Classic IDE
        const extSlash = getSelectableSlashCommandForTarget('/goal fix tests', {
            title: 'Antigravity',
            url: 'http://127.0.0.1:41001/?extensionView=true',
        });
        assert(extSlash && extSlash.command === 'goal', 'IDE 2.6+ extensionView should use Lexical slash chips');

        const legacySlash = getSelectableSlashCommandForTarget('/goal fix tests', {
            title: 'Classic IDE',
            url: 'vscode-webview://antigravity',
        });
        assert.strictEqual(legacySlash, null, 'Legacy vscode-webview target should stay raw');
        console.log('  ✅ Slash command selection for IDE 2.6+ extensionView passed');

        // 3. IDEDriver hybrid script & autoaccept settings guard
        const ideDriver = DriverFactory.getDriver('ide');
        assert.strictEqual(ideDriver.appType, 'ide');
        assert(['antigravity', 'antigravity-ide'].includes(ideDriver.appDataName));
        assert(ideDriver.getLocatorsScript().includes('extensionView=true'));

        const aaScript = buildIDEObserverScript(['open', 'run'], [], []);
        assert(aaScript.includes('settings(?:-standalone)?'), 'IDE autoaccept must skip settings pages');
        console.log('  ✅ IDEDriver hybrid locators and autoaccept settings guard passed');

        // 4. Work Orders IDE backend does NOT block user chat & tracks concurrent orders
        const { startWorkOrders } = require('../src/work_orders');
        const prevWoBackend = process.env.WORK_ORDERS_BACKEND;
        process.env.WORK_ORDERS_BACKEND = 'ide';
        const mockBot = {
            command: () => {},
            action: () => {},
            use: () => {},
            telegram: { sendMessage: async () => {} },
        };
        const mgr = startWorkOrders(mockBot, [123]);
        try {
            assert.strictEqual(mgr.shouldQueueUserChat(), false, 'IDE backend must never queue live user chat');
        } finally {
            mgr.stop();
            if (prevWoBackend === undefined) delete process.env.WORK_ORDERS_BACKEND;
            else process.env.WORK_ORDERS_BACKEND = prevWoBackend;
        }
        console.log('  ✅ Work Orders IDE backend non-blocking user chat check passed');

        // 5. Home-screen DOM-order collision guard: project-selector-trigger before model-selector-trigger
        const { JSDOM } = require('jsdom');
        const { STANDALONE_LOCATORS_SCRIPT } = require('../src/locators/standalone_locators');
        const dom = new JSDOM(`<!DOCTYPE html><body>
            <div data-testid="input-box-bottom-toolbar">
                <button data-testid="project-selector-trigger" aria-label="Select project (current: wo-demo)">wo-demo</button>
                <button data-testid="model-selector-trigger" aria-label="Select model (current: Gemini 4 Carbon High)">Gemini 4 Carbon High</button>
            </div>
        </body>`, { runScripts: 'dangerously' });
        for (const el of dom.window.document.querySelectorAll('button')) {
            Object.defineProperty(el, 'offsetWidth', { value: 120 });
            Object.defineProperty(el, 'offsetHeight', { value: 28 });
        }
        dom.window.eval(STANDALONE_LOCATORS_SCRIPT);
        const modelBtn = dom.window.eval('AG_UI.getModelSelectorButton()');
        assert(modelBtn, 'getModelSelectorButton must find a button');
        assert.strictEqual(modelBtn.getAttribute('data-testid'), 'model-selector-trigger', 'Must pick model-selector-trigger over preceding project-selector-trigger');

        // 6. Verify Work Orders strings cover all 7 supported languages with matching keys
        const { STR } = require('../src/work_orders/strings');
        const enKeys = Object.keys(STR.en).sort();
        for (const lang of ['tr', 'zh', 'ko', 'de', 'es', 'fr']) {
            assert(STR[lang], `Missing language ${lang} in work_orders/strings.js`);
            assert.deepStrictEqual(Object.keys(STR[lang]).sort(), enKeys, `Key mismatch in work_orders/strings.js for ${lang}`);
        }
        console.log('  ✅ Home-screen model-selector locator priority & 7-language Work Orders strings passed');

        console.log('✅ All Antigravity IDE 2.6+ integration tests passed!');
    } finally {
        if (prevApp === undefined) delete process.env.ANTIGRAVITY_PREFERRED_APP;
        else process.env.ANTIGRAVITY_PREFERRED_APP = prevApp;
    }
}

runTests().catch((err) => {
    console.error('❌ IDE integration test failed:', err);
    process.exit(1);
});
