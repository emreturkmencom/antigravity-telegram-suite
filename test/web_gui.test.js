const assert = require('assert');
const http = require('http');
const { WebEventBus } = require('../src/web/event_bus');
const { LogInterceptor } = require('../src/web/log_interceptor');
const { WebDashboardServer } = require('../src/web/server');

function makeRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'object' ? JSON.stringify(body) : body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Web GUI Unit & Integration Tests...');

  // Test 1: Event Bus
  const bus = new WebEventBus();
  let received = null;
  bus.on('telegram_interaction', (data) => {
    received = data;
  });
  const emitted = bus.emitEvent('telegram_interaction', { userId: 12345, text: '/help' });
  assert.strictEqual(received.payload.userId, 12345);
  assert.strictEqual(bus.getRecentEvents().length, 1);
  assert.strictEqual(bus.getRecentEvents()[0].id, emitted.id);
  console.log('  ✔ EventBus functions correctly');

  // Test 2: Log Interceptor
  const interceptor = new LogInterceptor({ maxLogs: 10 });
  interceptor.start();
  console.log('Regular log test');
  console.warn('Warning log test');
  console.error(new Error('Test error log'));
  interceptor.stop();

  const allLogs = interceptor.getLogs();
  assert(allLogs.length >= 3, 'Should record logs');
  const errorLog = allLogs.find(l => l.isError || l.level === 'error');
  assert(errorLog, 'Should flag error log correctly');
  assert.strictEqual(errorLog.tag, 'ERROR');

  const warnLogs = interceptor.getLogs(10, 'warn');
  assert(warnLogs.length >= 1, 'Should filter warn logs');
  console.log('  ✔ LogInterceptor correctly captures, tags, and filters logs');

  // Test 3: Web Dashboard Server Endpoints
  const testPort = 39871;
  const server = new WebDashboardServer({
    port: testPort,
    botContext: { botInfo: { username: 'TestAntigravityBot' } }
  });

  await server.start();

  try {
    // Test /api/status
    const statusRes = await makeRequest(`http://localhost:${testPort}/api/status`);
    assert.strictEqual(statusRes.statusCode, 200);
    const statusData = JSON.parse(statusRes.body);
    assert.strictEqual(statusData.bot.online, true);
    assert.strictEqual(statusData.bot.username, 'TestAntigravityBot');
    assert(typeof statusData.cdp.ide.online === 'boolean');
    console.log('  ✔ GET /api/status returned valid schema');

    // Test /api/logs
    const logsRes = await makeRequest(`http://localhost:${testPort}/api/logs`);
    assert.strictEqual(logsRes.statusCode, 200);
    const logsData = JSON.parse(logsRes.body);
    assert(Array.isArray(logsData.logs));
    console.log('  ✔ GET /api/logs returned valid array');

    // Test /api/config
    const configRes = await makeRequest(`http://localhost:${testPort}/api/config`);
    assert.strictEqual(configRes.statusCode, 200);
    const configData = JSON.parse(configRes.body);
    assert(configData.env !== undefined);
    console.log('  ✔ GET /api/config returned environment payload');

    // Test / (Serving Frontend HTML)
    const htmlRes = await makeRequest(`http://localhost:${testPort}/`);
    assert.strictEqual(htmlRes.statusCode, 200);
    assert(htmlRes.body.includes('Antigravity Telegram Suite | Web Dashboard'));
    assert(htmlRes.body.includes('tailwindcss.com'));
    console.log('  ✔ GET / serves Tailwind-powered Dashboard SPA');

    // Test action endpoint
    const actionRes = await makeRequest(`http://localhost:${testPort}/api/actions/reconnect-cdp`, {
      method: 'POST'
    });
    assert.strictEqual(actionRes.statusCode, 200);
    const actionData = JSON.parse(actionRes.body);
    assert.strictEqual(actionData.success, true);
    console.log('  ✔ POST /api/actions/reconnect-cdp dispatches action event');

  } finally {
    await server.stop();
  }

  console.log('✅ All Web GUI tests passed successfully!');
}

runTests().catch(err => {
  console.error('❌ Web GUI test failed:', err);
  process.exit(1);
});
