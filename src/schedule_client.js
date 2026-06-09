/**
 * CronCrew Schedule Client
 * 
 * Connects to the CronCrew API server for premium schedule management.
 * This client is loaded dynamically only when schedule features are needed.
 */
const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(os.homedir(), '.gemini', 'antigravity', 'croncrew.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {}
    return null;
}

function saveConfig(cfg) {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function collectSignals() {
    const cpus = os.cpus();
    const signals = {
        machineId: '',
        productUuid: '',
        boardSerial: '',
        diskSerial: '',
        cpu: cpus.length > 0 ? `${cpus[0].model}|${cpus.length}` : '',
        ram: String(os.totalmem()),
        os: `${os.platform()}|${os.arch()}`,
        hostname: os.hostname()
    };

    // Linux-specific hardware IDs
    try { signals.machineId = fs.readFileSync('/etc/machine-id', 'utf-8').trim(); } catch (e) {}
    try { signals.productUuid = fs.readFileSync('/sys/class/dmi/id/product_uuid', 'utf-8').trim(); } catch (e) {}
    try { signals.boardSerial = fs.readFileSync('/sys/class/dmi/id/board_serial', 'utf-8').trim(); } catch (e) {}
    try {
        const diskDir = '/dev/disk/by-id/';
        if (fs.existsSync(diskDir)) {
            const disks = fs.readdirSync(diskDir).filter(d => !d.includes('part'));
            if (disks.length > 0) signals.diskSerial = disks[0];
        }
    } catch (e) {}

    // macOS fallback
    if (os.platform() === 'darwin' && !signals.machineId) {
        try {
            const { execSync } = require('child_process');
            signals.machineId = execSync('ioreg -rd1 -c IOPlatformExpertDevice | awk \'/IOPlatformUUID/{print $NF}\'', { encoding: 'utf-8' }).trim().replace(/"/g, '');
        } catch (e) {}
    }

    return signals;
}

function request(method, endpoint, body = null) {
    const cfg = loadConfig();
    if (!cfg || !cfg.serverUrl || !cfg.licenseKey) {
        return Promise.reject(new Error('CronCrew yapılandırılmamış. /schedule_setup ile kurulumu yapın.'));
    }

    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, cfg.serverUrl);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        
        const signals = collectSignals();
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.licenseKey}`,
            'X-Device-Signals': JSON.stringify(signals)
        };

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname,
            method,
            headers,
            timeout: 15000
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`Invalid response: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// ===== PUBLIC API =====

async function setup(serverUrl, licenseKey) {
    saveConfig({ serverUrl, licenseKey });
    
    // Test activation
    const signals = collectSignals();
    const url = new URL('/api/auth/activate', serverUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    return new Promise((resolve, reject) => {
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
                    } else {
                        saveConfig({ serverUrl, licenseKey, tier: parsed.tier, activated: true });
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`Invalid response: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Connection timeout')); });
        req.write(JSON.stringify({ key: licenseKey, rawSignals: signals }));
        req.end();
    });
}

function isConfigured() {
    const cfg = loadConfig();
    return cfg && cfg.serverUrl && cfg.licenseKey && cfg.activated;
}

function getConfig() {
    return loadConfig();
}

async function getStatus() {
    return request('GET', '/api/auth/status');
}

async function getUsage() {
    return request('GET', '/api/usage');
}

async function getTiers() {
    const cfg = loadConfig();
    if (!cfg || !cfg.serverUrl) throw new Error('CronCrew yapılandırılmamış.');
    
    return new Promise((resolve, reject) => {
        const url = new URL('/api/usage/tiers', cfg.serverUrl);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        
        const req = lib.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
    });
}

async function listSchedules() {
    return request('GET', '/api/schedules');
}

async function createSchedule(data) {
    return request('POST', '/api/schedules', data);
}

async function deleteSchedule(id) {
    return request('DELETE', `/api/schedules/${id}`);
}

async function pauseSchedule(id) {
    return request('PATCH', `/api/schedules/${id}`, { status: 'paused' });
}

async function resumeSchedule(id) {
    return request('PATCH', `/api/schedules/${id}`, { status: 'active' });
}

async function executeSchedule(id) {
    return request('POST', `/api/schedules/${id}/execute`);
}

async function reportResult(scheduleId, executionId, status, durationMs, summary) {
    return request('POST', `/api/schedules/${scheduleId}/result`, {
        executionId, status, durationMs, summary
    });
}

module.exports = {
    setup,
    isConfigured,
    getConfig,
    getStatus,
    getUsage,
    getTiers,
    listSchedules,
    createSchedule,
    deleteSchedule,
    pauseSchedule,
    resumeSchedule,
    executeSchedule,
    reportResult,
    collectSignals
};
