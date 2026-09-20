const http = require('http');
const fs = require('fs');
const path = require('path');
const { eventBus } = require('./event_bus');
const { logInterceptor } = require('./log_interceptor');
const { isCdpReachable } = require('../cdp_health');

class WebDashboardServer {
  constructor(options = {}) {
    this.port = options.port || parseInt(process.env.WEB_GUI_PORT, 10) || 3000;
    this.host = options.host || process.env.WEB_GUI_HOST || '0.0.0.0';
    this.server = null;
    this.sseClients = new Set();
    this.botContext = options.botContext || null;
    this.cdpController = options.cdpController || null;
    this.startTime = Date.now();

    this._setupEventListeners();
  }

  _setupEventListeners() {
    eventBus.on('broadcast', (event) => {
      this.broadcastSSE(event);
    });
  }

  broadcastSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  setContext(context = {}) {
    if (context.botContext) this.botContext = context.botContext;
    if (context.cdpController) this.cdpController = context.cdpController;
  }

  async getStatus() {
    const idePort = parseInt(process.env.IDE_CDP_PORT, 10) || 9222;
    const agentPort = parseInt(process.env.AGENT_CDP_PORT, 10) || 9223;

    const [ideOnline, agentOnline] = await Promise.all([
      isCdpReachable(idePort, 1000).catch(() => false),
      isCdpReachable(agentPort, 1000).catch(() => false)
    ]);

    const mem = process.memoryUsage();

    return {
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      bot: {
        online: Boolean(this.botContext && this.botContext.botInfo),
        username: this.botContext && this.botContext.botInfo ? this.botContext.botInfo.username : (process.env.BOT_NAME || 'AntigravityBot'),
        allowedUsersCount: (process.env.ALLOWED_USERS || '').split(',').filter(Boolean).length
      },
      cdp: {
        ide: {
          port: idePort,
          online: ideOnline
        },
        agent: {
          port: agentPort,
          online: agentOnline
        },
        activeDriver: process.env.DEFAULT_APP || 'ide'
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024)
      }
    };
  }

  readConfig() {
    const envPath = path.resolve(process.cwd(), '.env');
    const envExamplePath = path.resolve(process.cwd(), '.env.example');

    let currentEnv = {};
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.substring(0, idx).trim();
            const val = trimmed.substring(idx + 1).trim();
            currentEnv[key] = val;
          }
        }
      });
    }

    return {
      env: currentEnv,
      envPath: fs.existsSync(envPath) ? envPath : envExamplePath
    };
  }

  saveConfig(updates) {
    const envPath = path.resolve(process.cwd(), '.env');
    let existingLines = [];
    if (fs.existsSync(envPath)) {
      existingLines = fs.readFileSync(envPath, 'utf8').split('\n');
    }

    const updatedKeys = new Set(Object.keys(updates));
    const newLines = existingLines.map(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.substring(0, idx).trim();
          if (updatedKeys.has(key)) {
            updatedKeys.delete(key);
            process.env[key] = String(updates[key]);
            return `${key}=${updates[key]}`;
          }
        }
      }
      return line;
    });

    for (const key of updatedKeys) {
      process.env[key] = String(updates[key]);
      newLines.push(`${key}=${updates[key]}`);
    }

    fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
    eventBus.emitEvent('config_updated', { keys: Object.keys(updates) });
    return { success: true, updated: Object.keys(updates) };
  }

  start() {
    logInterceptor.start();

    this.server = http.createServer(async (req, res) => {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = urlObj.pathname;

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // API Endpoints
      if (pathname === '/api/status' && req.method === 'GET') {
        const status = await this.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
        return;
      }

      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        // Send initial connected event
        res.write(`data: ${JSON.stringify({ type: 'connected', payload: { time: new Date().toISOString() } })}\n\n`);
        
        // Push recent events
        const recent = eventBus.getRecentEvents();
        for (const evt of recent.slice(0, 10).reverse()) {
          res.write(`data: ${JSON.stringify(evt)}\n\n`);
        }

        this.sseClients.add(res);

        req.on('close', () => {
          this.sseClients.delete(res);
        });
        return;
      }

      if (pathname === '/api/logs' && req.method === 'GET') {
        const limit = parseInt(urlObj.searchParams.get('limit') || '200', 10);
        const filter = urlObj.searchParams.get('filter') || 'all';
        const logs = logInterceptor.getLogs(limit, filter);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ logs }));
        return;
      }

      if (pathname === '/api/logs/clear' && req.method === 'POST') {
        logInterceptor.clear();
        eventBus.emitEvent('logs_cleared', {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (pathname === '/api/config' && req.method === 'GET') {
        const config = this.readConfig();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(config));
        return;
      }

      if (pathname === '/api/config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const result = this.saveConfig(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      if (pathname === '/api/actions/reconnect-cdp' && req.method === 'POST') {
        eventBus.emitEvent('action_reconnect_cdp', { initiator: 'web_gui' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'CDP reconnection signal emitted' }));
        return;
      }

      if (pathname === '/api/actions/restart' && req.method === 'POST') {
        eventBus.emitEvent('action_restart', { initiator: 'web_gui' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Bot restart scheduled' }));
        setTimeout(() => {
          process.emit('SIGUSR2');
        }, 800);
        return;
      }

      if (pathname === '/api/actions/emit-test-error' && req.method === 'POST') {
        console.error(new Error('[WebGUI Test Error] Simulated live error for UI testing'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // Serve Static Frontend
      let filePath = pathname === '/' ? '/index.html' : pathname;
      const staticDir = path.join(__dirname, 'public');
      const safePath = path.normalize(path.join(staticDir, filePath));

      if (safePath.startsWith(staticDir) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        const ext = path.extname(safePath).toLowerCase();
        const contentTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png'
        };
        const contentType = contentTypes[ext] || 'text/plain';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(safePath).pipe(res);
      } else {
        // Fallback to index.html for SPA
        const indexPath = path.join(staticDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Web Dashboard file not found.');
        }
      }
    });

    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        const url = `http://localhost:${this.port}`;
        console.log(`[WebGUI] Dashboard server running at ${url}`);
        resolve(this);
      });
    });
  }

  stop() {
    logInterceptor.stop();
    for (const client of this.sseClients) {
      try { client.end(); } catch (e) {}
    }
    this.sseClients.clear();
    if (this.server) {
      return new Promise(resolve => this.server.close(resolve));
    }
    return Promise.resolve();
  }
}

let defaultServer = null;

function startDashboardServer(options = {}) {
  if (!defaultServer) {
    defaultServer = new WebDashboardServer(options);
    defaultServer.start();
  }
  return defaultServer;
}

module.exports = {
  WebDashboardServer,
  startDashboardServer,
  eventBus,
  logInterceptor
};
