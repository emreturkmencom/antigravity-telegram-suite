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
        try {
            setPreferredWindow(null);
            setActiveWorkspace(null);

            // listWindows returns only real top-level IDE windows (excludes data: splash and iframes)
            const wins = await listWindows(srv.port);
            assert.deepStrictEqual(wins.map(w => w.id), ['WIN_A', 'WIN_B']);

            // resolveTargets(true) excludes outer vscode-webview, settings-standalone, plugin://, data:,
            // and ranks live extensionView agent panels ahead of workbench shells
            const resolved = await resolveTargets(srv.port, true);
            assert.deepStrictEqual(resolved.map(t => t.id), ['PANEL_A', 'PANEL_B', 'WIN_A', 'WIN_B']);
            assert.strictEqual(resolved[0].windowId, 'WIN_A');
            assert.strictEqual(resolved[0].workspaceName, 'alpha-proj');
            assert.strictEqual(resolved[1].windowId, 'WIN_B');
            assert.strictEqual(resolved[1].workspaceName, 'wo-beta');

            // Selecting Window B via /window routes agent commands to PANEL_B first (not WIN_B shell!)
            setPreferredWindow('WIN_B');
            const byWinB = await resolveTargets(srv.port, true);
            assert.strictEqual(byWinB[0].id, 'PANEL_B');
            assert.strictEqual(byWinB[1].id, 'WIN_B');

            // Workspace routing prioritizes matching window's agent panel
            setPreferredWindow(null);
            setActiveWorkspace('wo-beta');
            const byWs = await resolveTargets(srv.port, true);
            assert.strictEqual(byWs[0].id, 'PANEL_B');

            setActiveWorkspace(null);
            console.log('  ✅ Target graph resolution, settings exclusion, and window->panel routing passed');
        } finally {
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
