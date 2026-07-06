/**
 * account_manager.js
 *
 * Google OAuth login flow and account management for the Telegram bot.
 * Handles token exchange, storage, refresh, quota fetching, and
 * credential injection into Antigravity's SQLite state database.
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { URLSearchParams } = require('url');
const ProtobufUtils = require('./protobuf_utils');

// ─── OAuth Constants ──────────────────────────────────────────────────────────
// Google OAuth client credentials for Antigravity cloud access
// ─── OAuth Constants & Registry ───────────────────────────────────────────────
const OAUTH_CLIENTS_ENV = 'ANTIGRAVITY_OAUTH_CLIENTS';
const ACTIVE_OAUTH_CLIENT_ENV = 'ANTIGRAVITY_OAUTH_CLIENT_KEY';
const DEFAULT_OAUTH_CLIENT_KEY = 'antigravity_enterprise';

function normalizeClientKey(key) {
    return (key || '').trim().toLowerCase();
}

/**
 * Dynamically resolves the active Google OAuth client configuration.
 * Supports environment variables exactly like AntigravityManager.
 * 
 * @returns {{key: string, client_id: string, client_secret: string}}
 */
function getActiveClient() {
    let defaultClientId = process.env.GOOGLE_CLIENT_ID;
    let defaultClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!defaultClientId || !defaultClientSecret) {
        throw new Error('Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.');
    }

    // Decode from base64 if the provided values are base64-encoded
    if (defaultClientId.endsWith('=')) {
        try {
            defaultClientId = Buffer.from(defaultClientId, 'base64').toString('utf8');
        } catch (_) {}
    }
    if (defaultClientSecret.endsWith('=')) {
        try {
            defaultClientSecret = Buffer.from(defaultClientSecret, 'base64').toString('utf8');
        } catch (_) {}
    }

    const clients = [
        {
            key: normalizeClientKey(DEFAULT_OAUTH_CLIENT_KEY),
            client_id: defaultClientId,
            client_secret: defaultClientSecret,
        }
    ];

    const rawExtraClients = process.env[OAUTH_CLIENTS_ENV];
    if (typeof rawExtraClients === 'string' && rawExtraClients.trim() !== '') {
        for (const entry of rawExtraClients.split(';')) {
            const trimmed = entry.trim();
            if (trimmed === '') {
                continue;
            }

            const parts = trimmed.split('|').map(part => part.trim());
            if (parts.length < 3) {
                logInfo(`[account_manager] Ignored invalid OAuth client entry in ${OAUTH_CLIENTS_ENV}: ${trimmed}`);
                continue;
            }

            const key = normalizeClientKey(parts[0]);
            const clientId = parts[1];
            const clientSecret = parts[2];
            if (key === '' || clientId === '' || clientSecret === '') {
                logInfo(`[account_manager] Ignored incomplete OAuth client entry in ${OAUTH_CLIENTS_ENV}: ${trimmed}`);
                continue;
            }

            const clientConfig = {
                key,
                client_id: clientId,
                client_secret: clientSecret,
            };

            const existingIndex = clients.findIndex(client => client.key === key);
            if (existingIndex >= 0) {
                clients[existingIndex] = clientConfig;
            } else {
                clients.push(clientConfig);
            }
        }
    }

    const activeKey = normalizeClientKey(process.env[ACTIVE_OAUTH_CLIENT_ENV] || DEFAULT_OAUTH_CLIENT_KEY);
    const activeClient = clients.find(client => client.key === activeKey) || clients[0];

    return activeClient;
}

const SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
    'https://www.googleapis.com/auth/aicode',
].join(' ');

const URLS = {
    AUTH:      'https://accounts.google.com/o/oauth2/v2/auth',
    TOKEN:     'https://oauth2.googleapis.com/token',
    USER_INFO: 'https://www.googleapis.com/oauth2/v2/userinfo',
    CREDITS:   'https://cloudcode-pa.googleapis.com/v1internal:fetchCredits',
    // loadCodeAssist — project context + subscription tier
    LOAD_PROJECT:      'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
    LOAD_PROJECT_SAND: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist',
    LOAD_PROJECT_DAILY:'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
};

// ─── Quota API endpoints (sandbox first, exactly matching AntigravityManager) ─
const QUOTA_API_ENDPOINTS = [
    'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
    'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
    'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
];

const QUOTA_SUMMARY_ENDPOINTS = [
    'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary',
    'https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary',
    'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary',
];

// Mirrors AntigravityManager's FALLBACK_VERSION
const FALLBACK_VERSION = '2.0.3';

/**
 * Build the User-Agent header exactly as AntigravityManager does.
 * Format: `antigravity/<version> <platform>/<arch>`
 */
function buildUserAgent() {
    const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
    const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : process.arch;
    return `antigravity/${FALLBACK_VERSION} ${platform}/${arch}`;
}

/** Shared internal API headers, matching AntigravityManager's buildInternalApiHeaders. */
function buildInternalApiHeaders(accessToken) {
    return {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': buildUserAgent(),
        'Content-Type': 'application/json',
    };
}

// OAuth redirect server base port
const OAUTH_PORT = 8888;
const OAUTH_FALLBACK_PORTS = [8888, 8889, 8890, 8891, 8892];

// ─── Account Storage ──────────────────────────────────────────────────────────
const ACCOUNTS_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'tg_accounts.json');

const LOG_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'tg_login.log');
const LOCAL_LOG_FILE = path.join(__dirname, '..', 'login.log');

/**
 * Log message with ISO timestamp to the console and to the log files.
 */
function logInfo(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    try {
        const dir = path.dirname(LOG_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.appendFileSync(LOCAL_LOG_FILE, line, 'utf-8');
        fs.appendFileSync(LOG_FILE, line, 'utf-8');
    } catch (_) {}
    console.log(line.trim());
}

/** Load all accounts from disk. Returns a plain object keyed by numeric ID string. */
function loadAccounts() {
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
        }
    } catch (e) {
        logInfo(`[account_manager] Failed to load accounts: ${e.message}`);
    }
    return {};
}

/** Persist all accounts to disk. */
function saveAccounts(accounts) {
    try {
        const dir = path.dirname(ACCOUNTS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
    } catch (e) {
        logInfo(`[account_manager] Failed to save accounts: ${e.message}`);
    }
}

/**
 * Get the next available numeric account ID (1, 2, 3, ...).
 * @param {object} accounts - The accounts object.
 */
function getNextNumericId(accounts) {
    const ids = Object.keys(accounts).map(Number).filter(n => !isNaN(n));
    if (ids.length === 0) {
        return 1;
    }
    return Math.max(...ids) + 1;
}

/**
 * Find an account by its numeric ID.
 * @param {object} accounts
 * @param {number|string} id
 * @returns {object|null}
 */
function findAccount(accounts, id) {
    return accounts[String(id)] || null;
}

// ─── OAuth Server ─────────────────────────────────────────────────────────────

/**
 * Start a local HTTP server to capture the OAuth redirect code.
 * Tries ports 8888–8892, picks the first available.
 *
 * @param {function(string): void} onCode - Called with the auth code when captured.
 * @param {function(string): void} onError - Called with an error message.
 * @returns {Promise<{server: http.Server, port: number, stop: function}>}
 */
async function startOAuthServer(onCode, onError) {
    let boundPort = null;

    for (const port of OAUTH_FALLBACK_PORTS) {
        try {
            await new Promise((resolve, reject) => {
                const test = http.createServer();
                test.once('error', reject);
                test.listen(port, '127.0.0.1', () => test.close(resolve));
            });
            boundPort = port;
            break;
        } catch {
            // Port busy, try next
        }
    }

    if (!boundPort) {
        throw new Error('No available port found for OAuth callback server (tried 8888–8892)');
    }

    logInfo(`[account_manager] OAuth callback server listening on http://127.0.0.1:${boundPort}/oauth-callback`);

    const server = http.createServer((req, res) => {
        if (req.method !== 'GET') {
            res.writeHead(405);
            res.end('Method Not Allowed');
            return;
        }

        const url = new URL(req.url || '', `http://127.0.0.1:${boundPort}`);

        if (url.pathname !== '/oauth-callback') {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (code) {
            logInfo(`[account_manager] Captured OAuth callback code via localhost query`);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                  <body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#0d1117;color:#e6edf3">
                    <div style="font-size:64px;margin-bottom:20px">✅</div>
                    <h1 style="color:#3fb950">Login Successful!</h1>
                    <p style="color:#8b949e">You can close this tab and return to Telegram.</p>
                    <script>setTimeout(()=>window.close(),3000)</script>
                  </body>
                </html>
            `);
            // Small delay so the page renders before the server stops
            setTimeout(() => onCode(code), 200);
        } else if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<html><body><h1>Login Failed</h1><p>${error}</p></body></html>`);
            onError(`Google OAuth error: ${error}`);
        } else {
            res.writeHead(400);
            res.end('Missing code parameter');
        }
    });

    server.on('error', (err) => {
        logInfo(`[account_manager] OAuth server error: ${err.message}`);
    });

    await new Promise((resolve, reject) => {
        const onError = (err) => reject(err);
        server.once('error', onError);
        server.listen(boundPort, '127.0.0.1', () => {
            server.removeListener('error', onError);
            resolve();
        });
    });

    return {
        server,
        port: boundPort,
        stop: () => new Promise((resolve) => server.close(resolve)),
    };
}

// ─── OAuth URL Builder ────────────────────────────────────────────────────────

/**
 * Build the Google OAuth authorization URL.
 *
 * @param {string} redirectUri - e.g. "http://localhost:8888/oauth-callback"
 * @returns {string}
 */
function buildAuthUrl(redirectUri) {
    const client = getActiveClient();
    const params = new URLSearchParams({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        response_type: 'code',
        client_id: client.client_id,
        redirect_uri: redirectUri,
        include_granted_scopes: 'true',
        state: Math.random().toString(36).slice(2),
    });
    return `${URLS.AUTH}?${params.toString()}`;
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

/** Simple HTTPS POST with form-encoded body. Returns parsed JSON. */
async function httpsPost(url, bodyParams, headers = {}) {
    const body = new URLSearchParams(bodyParams).toString();
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
                ...headers,
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${json.error_description || json.error || data}`));
                    } else {
                        resolve(json);
                    }
                } catch {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => req.destroy(new Error('Request timed out')));
        req.write(body);
        req.end();
    });
}

/** Simple HTTPS GET. Returns parsed JSON. */
async function httpsGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers,
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${json.error_description || json.error || data}`));
                    } else {
                        resolve(json);
                    }
                } catch {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => req.destroy(new Error('Request timed out')));
        req.end();
    });
}

/** Simple HTTPS POST with JSON body. Always resolves with _status attached. */
async function httpsPostJson(url, bodyObj, headers = {}) {
    const body = JSON.stringify(bodyObj);
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...headers,
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    // Always attach _status so callers can inspect HTTP code
                    // (Google error responses are valid JSON, e.g. {"error":{"code":403}})
                    const json = JSON.parse(data);
                    resolve({ ...json, _status: res.statusCode });
                } catch {
                    resolve({ _raw: data, _status: res.statusCode });
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => req.destroy(new Error('Request timed out')));
        req.write(body);
        req.end();
    });
}

// ─── Google API Calls ─────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for tokens.
 *
 * @param {string} code - The authorization code from the OAuth redirect.
 * @param {string} redirectUri - Must match the one used in buildAuthUrl().
 * @returns {Promise<{access_token, refresh_token, expires_in, token_type, id_token}>}
 */
async function exchangeCode(code, redirectUri) {
    const client = getActiveClient();
    const result = await httpsPost(URLS.TOKEN, {
        client_id: client.client_id,
        client_secret: client.client_secret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
    });
    if (!result.access_token) {
        throw new Error(`Token exchange failed: ${result.error_description || result.error || JSON.stringify(result)}`);
    }
    return result;
}

/**
 * Fetch basic user info (email, name) from Google.
 *
 * @param {string} accessToken
 * @returns {Promise<{id, email, name, picture}>}
 */
async function getUserInfo(accessToken) {
    return httpsGet(URLS.USER_INFO, {
        Authorization: `Bearer ${accessToken}`,
    });
}

/**
 * Refresh an expired access token using the refresh token.
 *
 * @param {string} refreshToken
 * @returns {Promise<{access_token, expires_in, token_type}>}
 */
async function refreshAccessToken(refreshToken) {
    const client = getActiveClient();
    const result = await httpsPost(URLS.TOKEN, {
        client_id: client.client_id,
        client_secret: client.client_secret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
    });
    if (!result.access_token) {
        throw new Error(`Token refresh failed: ${result.error_description || result.error || JSON.stringify(result)}`);
    }
    return result;
}

/**
 * Regex to identify tracked models (mirrors AntigravityManager's isTrackedModel).
 */
const TRACKED_MODEL_RE = /^(gemini|claude|gpt|image|imagen)/i;

/**
 * Fetch the project context (subscription tier + project ID) from the
 * loadCodeAssist endpoint. Mirrors AntigravityManager's fetchProjectContext.
 *
 * @param {string} accessToken
 * @returns {Promise<{projectId?: string, subscriptionTier?: string}>}
 */
async function fetchProjectContext(accessToken) {
    // Match AntigravityManager's endpoint order: prod → sandbox
    const endpoints = [URLS.LOAD_PROJECT, URLS.LOAD_PROJECT_SAND];
    const body = { metadata: { ideType: 'ANTIGRAVITY' } };
    let lastError;

    for (const endpoint of endpoints) {
        try {
            const data = await httpsPostJson(endpoint, body, buildInternalApiHeaders(accessToken));

            if (data._status >= 400) {
                lastError = new Error(`HTTP ${data._status} from ${endpoint}`);
                continue;
            }

            // Resolve subscription tier (mirrors resolveSubscriptionTier)
            let subscriptionTier;
            const paidTier = data.paidTier;
            if (paidTier && (paidTier.name || paidTier.id)) {
                subscriptionTier = (paidTier.name || paidTier.id).trim();
            } else if (data.currentTier && (data.currentTier.name || data.currentTier.id)) {
                subscriptionTier = (data.currentTier.name || data.currentTier.id).trim();
            } else if (Array.isArray(data.allowedTiers) && data.allowedTiers.length > 0) {
                const preferred = data.allowedTiers.find(t => t.is_default) || data.allowedTiers[0];
                subscriptionTier = (preferred.name || preferred.id || '').trim();
            }

            return {
                projectId: typeof data.cloudaicompanionProject === 'string' ? data.cloudaicompanionProject : undefined,
                subscriptionTier: subscriptionTier || undefined,
            };
        } catch (e) {
            lastError = e;
        }
    }

    // Non-fatal — quota fetch can still work without project context
    logInfo(`[account_manager] Project context unavailable (${lastError && lastError.message}); continuing without it.`);
    return {};
}

/**
 * Parse the raw fetchAvailableModels response into a normalised quota map.
 * Models WITHOUT quotaInfo (i.e. unlimited/pro tier) are included with
 * remainingFraction = 1 (100%) so they still appear in /getinfo.
 *
 * @param {object} data - Raw API response ({ models, deprecatedModelIds })
 * @param {string|undefined} subscriptionTier
 * @returns {{ models: object, subscription_tier?: string }}
 */
function parseQuotaResponse(data, subscriptionTier) {
    const result = {
        models: {},
        subscription_tier: subscriptionTier,
    };

    for (const [modelName, info] of Object.entries(data.models || {})) {
        if (!TRACKED_MODEL_RE.test(modelName)) {
            continue;
        }

        if (info.quotaInfo) {
            // Metered model — has real quota info
            result.models[modelName] = {
                quotaInfo: {
                    remainingFraction: info.quotaInfo.remainingFraction ?? 0,
                    resetTime: info.quotaInfo.resetTime || '',
                },
                displayName: info.displayName || modelName,
                recommended: !!info.recommended,
                unlimited: false,
            };
        } else {
            // No quotaInfo → unlimited access for this tier
            result.models[modelName] = {
                quotaInfo: null,
                displayName: info.displayName || modelName,
                recommended: !!info.recommended,
                unlimited: true,
            };
        }
    }

    return result;
}

/**
 * Fetch quota info for an account from Google Cloud Code APIs.
 *
 * Exactly mirrors AntigravityManager's GoogleAPIService.fetchQuota():
 * 1. Fetch project context (tier + projectId) via loadCodeAssist.
 * 2. POST quota endpoints in sandbox-first order with proper User-Agent.
 * 3. On 403 WITH projectId → retry same endpoint WITHOUT projectId.
 * 4. On 403 WITHOUT projectId → consumer account; return unlimited fallback.
 * 5. On 5xx/429 → fall back to next endpoint.
 *
 * @param {string} accessToken
 * @returns {Promise<{models: object, subscription_tier?: string, _unlimited?: boolean}>}
 */
async function fetchQuota(accessToken) {
    // Step 1 — project context (non-fatal)
    const { projectId, subscriptionTier } = await fetchProjectContext(accessToken);
    logInfo(`[account_manager] fetchQuota: projectId=${projectId || 'none'}, tier=${subscriptionTier || 'none'}`);

    const baseBody = projectId ? { project: projectId } : {};
    let lastError;

    for (let ei = 0; ei < QUOTA_API_ENDPOINTS.length; ei++) {
        const endpoint = QUOTA_API_ENDPOINTS[ei];
        const hasNextEndpoint = ei + 1 < QUOTA_API_ENDPOINTS.length;
        let currentBody = { ...baseBody };
        let retriedWithoutProject = false;

        while (true) {
            try {
                const result = await httpsPostJson(endpoint, currentBody, buildInternalApiHeaders(accessToken));

                const status = result._status;
                if (status >= 400) {
                    if (status === 403) {
                        if ('project' in currentBody && !retriedWithoutProject) {
                            logInfo(`[account_manager] Quota 403 with project, retrying without project on ${endpoint}`);
                            currentBody = {};
                            retriedWithoutProject = true;
                            continue;
                        }
                        // 403 without project — consumer/non-enterprise account
                        logInfo(`[account_manager] Quota FORBIDDEN (consumer account) — returning unlimited fallback`);
                        return {
                            models: {},
                            subscription_tier: subscriptionTier,
                            _unlimited: true,
                        };
                    }
                    if (status === 401) {
                        throw new Error(`UNAUTHORIZED: invalid credentials`);
                    }
                    // 5xx / 429 → try next endpoint
                    lastError = new Error(`HTTP ${status} from ${endpoint}`);
                    if (hasNextEndpoint) {
                        logInfo(`[account_manager] Quota ${status} from ${endpoint}, trying next endpoint`);
                        break;
                    }
                    throw lastError;
                }

                // Attach group-level quota summary (weekly/five-hour limits per model family).
                // Mirrors AntigravityManager GoogleAPIService.fetchQuota() at line 1066.
                const quotaResult = parseQuotaResponse(result, subscriptionTier);
                try {
                    const groups = await fetchQuotaSummary(accessToken, projectId);
                    if (groups) {
                        quotaResult.quota_groups = groups;
                    }
                } catch (e) {
                    logInfo(`[account_manager] Quota summary fetch failed (non-fatal): ${e.message}`);
                }
                return quotaResult;

            } catch (e) {
                lastError = e;
                if (e.message && e.message.startsWith('UNAUTHORIZED')) {
                    throw e;
                }
                if (hasNextEndpoint) {
                    logInfo(`[account_manager] Quota request failed at ${endpoint}: ${e.message} — trying next`);
                    break;
                }
                throw e;
            }
        }
    }

    throw lastError || new Error('All quota endpoints failed');
}

/**
 * Parse the raw retrieveUserQuotaSummary response into quota groups.
 * Mirrors AntigravityManager's toQuotaGroups() in GoogleAPIService.ts.
 *
 * @param {object} data - Raw API response with { groups: [...] }
 * @returns {Array|undefined}
 */
function parseQuotaGroups(data) {
    if (!Array.isArray(data.groups) || data.groups.length === 0) {
        return undefined;
    }

    return data.groups.map(group => ({
        display_name: group.displayName || '',
        description: group.description || '',
        buckets: Array.isArray(group.buckets)
            ? group.buckets.map(bucket => ({
                bucket_id: bucket.bucketId || '',
                window: bucket.window || '',
                remaining_fraction: typeof bucket.remainingFraction === 'number' ? bucket.remainingFraction : 0,
                reset_time: bucket.resetTime || '',
                display_name: bucket.displayName || '',
                description: bucket.description || '',
            }))
            : [],
    }));
}

/**
 * Fetch grouped quota summary from the retrieveUserQuotaSummary API.
 * Returns quota_groups (weekly/five-hour limits per model group) or undefined on failure.
 * Mirrors AntigravityManager's GoogleAPIService.fetchQuotaSummary().
 *
 * @param {string} accessToken
 * @param {string|undefined} projectId - Optional GCP project ID.
 * @returns {Promise<Array|undefined>}
 */
async function fetchQuotaSummary(accessToken, projectId) {
    const payload = projectId ? { project: projectId } : {};

    for (const endpoint of QUOTA_SUMMARY_ENDPOINTS) {
        try {
            const result = await httpsPostJson(endpoint, payload, buildInternalApiHeaders(accessToken));

            if (result._status >= 400) {
                logInfo(`[account_manager] Quota summary ${result._status} from ${endpoint}`);
                // 4xx (except 429) → stop trying; it's not a transient error
                if (result._status >= 400 && result._status < 500 && result._status !== 429) {
                    return undefined;
                }
                continue;
            }

            return parseQuotaGroups(result);
        } catch (e) {
            logInfo(`[account_manager] Quota summary request failed at ${endpoint}: ${e.message}`);
        }
    }

    return undefined;
}



/**
 * Check if an account's access token is near expiry and refresh it.
 * Refreshes if less than 5 minutes remain.
 *
 * @param {object} account - Account record from tg_accounts.json.
 * @returns {Promise<{account, refreshed: boolean}>}
 */
async function ensureFreshToken(account) {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = account.token.expiry_timestamp || 0;

    if (expiresAt > now + 300) {
        return { account, refreshed: false };
    }

    if (!account.token.refresh_token) {
        throw new Error('No refresh token available. Please /login again.');
    }

    const refreshed = await refreshAccessToken(account.token.refresh_token);
    account.token.access_token = refreshed.access_token;
    account.token.expires_in = refreshed.expires_in;
    account.token.expiry_timestamp = now + refreshed.expires_in;
    if (refreshed.refresh_token) {
        account.token.refresh_token = refreshed.refresh_token;
    }

    return { account, refreshed: true };
}

// ─── Token Injection into state.vscdb ────────────────────────────────────────

/**
 * Get the path(s) to Antigravity's state.vscdb SQLite database.
 * Checks all standard platform-specific locations in priority order.
 *
 * @param {string} app - 'agent' or 'ide'
 * @returns {string[]} Candidate paths in priority order.
 */
function getStatevscdbPaths(app) {
    const HOME = os.homedir();
    const platform = os.platform();
    const paths = [];

    if (app === 'ide') {
        const folderName = 'Antigravity IDE';
        switch (platform) {
            case 'win32': {
                const appData = process.env.APPDATA || '';
                paths.push(path.join(appData, folderName, 'User', 'globalStorage', 'state.vscdb'));
                paths.push(path.join(appData, folderName, 'User', 'state.vscdb'));
                paths.push(path.join(appData, folderName, 'state.vscdb'));
                // Also try alternate folder names
                paths.push(path.join(appData, 'Antigravity-IDE', 'User', 'globalStorage', 'state.vscdb'));
                break;
            }
            case 'darwin':
                paths.push(path.join(HOME, 'Library', 'Application Support', folderName, 'User', 'globalStorage', 'state.vscdb'));
                paths.push(path.join(HOME, 'Library', 'Application Support', folderName, 'state.vscdb'));
                break;
            default: // linux
                paths.push(path.join(HOME, '.config', folderName, 'User', 'globalStorage', 'state.vscdb'));
                paths.push(path.join(HOME, '.config', 'Antigravity-IDE', 'User', 'globalStorage', 'state.vscdb'));
        }
    } else {
        // Standalone agent
        const folderName = 'Antigravity';
        switch (platform) {
            case 'win32': {
                const appData = process.env.APPDATA || '';
                paths.push(path.join(appData, folderName, 'User', 'globalStorage', 'state.vscdb'));
                paths.push(path.join(appData, folderName, 'User', 'state.vscdb'));
                paths.push(path.join(appData, folderName, 'state.vscdb'));
                break;
            }
            case 'darwin':
                paths.push(path.join(HOME, 'Library', 'Application Support', folderName, 'User', 'globalStorage', 'state.vscdb'));
                paths.push(path.join(HOME, 'Library', 'Application Support', folderName, 'state.vscdb'));
                break;
            default: // linux
                paths.push(path.join(HOME, '.config', folderName, 'User', 'globalStorage', 'state.vscdb'));
        }
    }

    return paths.filter(p => p);
}

/**
 * Inject account credentials into Antigravity's state.vscdb.
 *
 * Writes `antigravityAuthStatus` (plain JSON) and `antigravityOnboarding` keys —
 * sufficient for modern Antigravity builds (≥2.0).
 *
 * For older builds that need the protobuf-encoded `jetskiStateSync.agentManagerInitState`,
 * a full port of ProtobufUtils is required (see FINDINGS.md §5).
 *
 * Uses the sqlite3 CLI (cross-platform) or falls back to inline Python sqlite3 module.
 *
 * @param {object} tokenData - Account record with token.
 * @param {string} app - 'agent' or 'ide'.
 * @returns {Promise<string>} The db path that was written.
 */
/**
 * Helper to query a value from ItemTable in state.vscdb using Python.
 */
async function readSqliteValue(dbPath, key) {
    const pythonCmd = await resolvePythonCommand();
    if (pythonCmd) {
        const { execFile } = require('child_process');
        const tempScriptPath = path.join(os.tmpdir(), `tg_sql_read_${Date.now()}.py`);
        const pyScript = [
            `import sqlite3`,
            `conn = sqlite3.connect("${dbPath.replace(/\\/g, '/')}")`,
            `cursor = conn.cursor()`,
            `cursor.execute("SELECT value FROM ItemTable WHERE key='${key}'")`,
            `row = cursor.fetchone()`,
            `print(row[0] if row else '')`,
            `conn.close()`,
        ].join('\n');

        try {
            fs.writeFileSync(tempScriptPath, pyScript, 'utf-8');
            return await new Promise((resolve) => {
                execFile(pythonCmd, [tempScriptPath], { timeout: 10000 }, (err, stdout, stderr) => {
                    if (err) {
                        resolve(null);
                    } else {
                        resolve(stdout.trim() || null);
                    }
                });
            });
        } finally {
            try { fs.unlinkSync(tempScriptPath); } catch (_) {}
        }
    }
    return null;
}

async function injectTokenIntoIde(tokenData, app) {
    const candidatePaths = getStatevscdbPaths(app);
    const dbPath = candidatePaths.find(p => fs.existsSync(p));

    if (!dbPath) {
        throw new Error(
            `Antigravity state.vscdb not found. Checked:\n${candidatePaths.join('\n')}\n\n` +
            `Please start Antigravity at least once before switching accounts.`
        );
    }

    // Capability/Format Detection
    const unifiedValue = await readSqliteValue(dbPath, 'antigravityUnifiedStateSync.oauthToken');
    const oldValue = await readSqliteValue(dbPath, 'jetskiStateSync.agentManagerInitState');

    let capability = 'dual';
    if (unifiedValue && oldValue) {
        capability = 'dual';
    } else if (unifiedValue) {
        capability = 'new';
    } else if (oldValue) {
        capability = 'old';
    }

    const sqlStatements = [];

    // Inject New Format (Unified State)
    if (capability === 'new' || capability === 'dual') {
        const oauthInfo = ProtobufUtils.createOAuthInfo(
            tokenData.token.access_token,
            tokenData.token.refresh_token,
            tokenData.token.expiry_timestamp,
            false,
            undefined,
            tokenData.email
        );

        let oauthTokenB64;
        if (unifiedValue) {
            try {
                const existingTopic = new Uint8Array(Buffer.from(unifiedValue, 'base64'));
                const mergedTopic = ProtobufUtils.replaceUnifiedTopicEntry(
                    existingTopic,
                    'oauthTokenInfoSentinelKey',
                    oauthInfo
                );
                oauthTokenB64 = Buffer.from(mergedTopic).toString('base64');
            } catch (e) {
                oauthTokenB64 = ProtobufUtils.createUnifiedStateEntry('oauthTokenInfoSentinelKey', oauthInfo);
            }
        } else {
            oauthTokenB64 = ProtobufUtils.createUnifiedStateEntry('oauthTokenInfoSentinelKey', oauthInfo);
        }

        const userStatusPayload = ProtobufUtils.createMinimalUserStatusPayload(tokenData.email);
        const userStatusEntry = ProtobufUtils.createUnifiedStateEntry(
            'userStatusSentinelKey',
            userStatusPayload
        );

        sqlStatements.push(`INSERT OR REPLACE INTO ItemTable(key,value) VALUES('antigravityUnifiedStateSync.oauthToken','${oauthTokenB64}');`);
        sqlStatements.push(`INSERT OR REPLACE INTO ItemTable(key,value) VALUES('antigravityUnifiedStateSync.userStatus','${userStatusEntry}');`);
        sqlStatements.push(`DELETE FROM ItemTable WHERE key='jetskiStateSync.agentManagerInitState';`);
    }

    // Inject Old Format (Legacy State)
    if (capability === 'old' || capability === 'dual') {
        if (oldValue) {
            try {
                const agentStateBytes = new Uint8Array(Buffer.from(oldValue, 'base64'));
                const stateWithoutPreviousToken = ProtobufUtils.removeField(agentStateBytes, 6);
                const oauthTokenField = ProtobufUtils.createOAuthTokenInfo(
                    tokenData.token.access_token,
                    tokenData.token.refresh_token,
                    tokenData.token.expiry_timestamp
                );

                const updatedAgentStateBytes = new Uint8Array(
                    stateWithoutPreviousToken.length + oauthTokenField.length
                );
                updatedAgentStateBytes.set(stateWithoutPreviousToken, 0);
                updatedAgentStateBytes.set(oauthTokenField, stateWithoutPreviousToken.length);

                const updatedEncodedAgentState = Buffer.from(updatedAgentStateBytes).toString('base64');
                sqlStatements.push(`INSERT OR REPLACE INTO ItemTable(key,value) VALUES('jetskiStateSync.agentManagerInitState','${updatedEncodedAgentState}');`);
            } catch (e) {
                // If legacy format injection fails, fallback will handle auth status write
            }
        }
    }

    // General Auth Status (Common Cleanup)
    const authStatus = JSON.stringify({
        name: tokenData.name || tokenData.email,
        email: tokenData.email,
        apiKey: tokenData.token.access_token,
    });
    const escapedAuthStatus = authStatus.replace(/'/g, "''");
    sqlStatements.push(`INSERT OR REPLACE INTO ItemTable(key,value) VALUES('antigravityAuthStatus','${escapedAuthStatus}');`);
    sqlStatements.push(`INSERT OR REPLACE INTO ItemTable(key,value) VALUES('antigravityOnboarding','true');`);
    sqlStatements.push(`DELETE FROM ItemTable WHERE key='google.antigravity';`);

    await runSqliteStatements(dbPath, sqlStatements);
    return dbPath;
}

/**
 * Run SQL statements against a SQLite database.
 * Tries sqlite3 CLI first, falls back to Python's built-in sqlite3 module.
 *
 * @param {string} dbPath
 * @param {string[]} statements
 */
async function runSqliteStatements(dbPath, statements) {
    // Strategy 1: sqlite3 CLI
    const sqlite3Available = await checkCommandAvailable('sqlite3');
    if (sqlite3Available) {
        const sql = statements.join('\n');
        await new Promise((resolve, reject) => {
            const cmd = `sqlite3 "${dbPath}" "${sql.replace(/"/g, '\\"')}"`;
            exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(`sqlite3 CLI error: ${stderr || err.message}`));
                } else {
                    resolve();
                }
            });
        });
        return;
    }

    // Strategy 2: Python sqlite3 module
    const pythonCmd = await resolvePythonCommand();
    if (pythonCmd) {
        const { execFile } = require('child_process');
        const tempScriptPath = path.join(os.tmpdir(), `tg_sql_write_${Date.now()}.py`);
        const pyScript = [
            `import sqlite3`,
            `conn = sqlite3.connect("${dbPath.replace(/\\/g, '/')}")`,
            `cursor = conn.cursor()`,
            ...statements.map(s => `cursor.execute("""${s.replace(/"""/g, '\\"\\"\\""')}""")`),
            `conn.commit()`,
            `conn.close()`,
        ].join('\n');

        try {
            fs.writeFileSync(tempScriptPath, pyScript, 'utf-8');
            await new Promise((resolve, reject) => {
                execFile(pythonCmd, [tempScriptPath], { timeout: 10000 }, (err, stdout, stderr) => {
                    if (err) {
                        reject(new Error(`Python sqlite3 error: ${stderr || err.message}`));
                    } else {
                        resolve();
                    }
                });
            });
        } finally {
            try { fs.unlinkSync(tempScriptPath); } catch (_) {}
        }
        return;
    }

    throw new Error(
        'Neither sqlite3 CLI nor Python is available to write to the database.\n' +
        'Please install sqlite3: https://sqlite.org/download.html'
    );
}

/**
 * Write to the OS credential store for modern Antigravity builds.
 * Format mirrors what Antigravity expects in the system keychain.
 *
 * @param {object} token - { access_token, refresh_token, expiry_timestamp }
 * @returns {Promise<void>}
 */
async function writeToCredentialStore(token) {
    const expiry = new Date(token.expiry_timestamp * 1000)
        .toISOString()
        .replace(/\.(\d{3})Z$/, '.$1000Z');

    const payload = JSON.stringify({
        token: {
            access_token: token.access_token,
            token_type: 'Bearer',
            refresh_token: token.refresh_token,
            expiry,
        },
        auth_method: 'consumer',
    });

    const platform = os.platform();

    if (platform === 'darwin') {
        const b64 = Buffer.from(payload, 'utf-8').toString('base64');
        const value = `go-keyring-base64:${b64}`;
        // Delete old entry first (ignore error if not found)
        await runCommand(`security delete-generic-password -s gemini -a antigravity 2>/dev/null || true`);
        await runCommand(`security add-generic-password -s gemini -a antigravity -w "${value.replace(/"/g, '\\"')}" -A`);
        return;
    }

    if (platform === 'win32') {
        const { execFile } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const tempScriptPath = path.join(os.tmpdir(), `tg_cred_${Date.now()}.ps1`);
        const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class CredStore {
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredWriteW(ref CREDENTIAL credential, uint flags);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    public static bool Write(string target, string user, string password) {
        var cred = new CREDENTIAL();
        cred.Type = 1; // Generic
        cred.TargetName = target;
        cred.UserName = user;
        cred.Persist = 2; // Local machine

        byte[] blob = System.Text.Encoding.UTF8.GetBytes(password);
        cred.CredentialBlobSize = (uint)blob.Length;
        cred.CredentialBlob = Marshal.AllocCoTaskMem(blob.Length);
        Marshal.Copy(blob, 0, cred.CredentialBlob, blob.Length);

        try {
            return CredWriteW(ref cred, 0);
        } finally {
            Marshal.FreeCoTaskMem(cred.CredentialBlob);
        }
    }
}
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
$res = [CredStore]::Write("gemini:antigravity", "antigravity", '${payload.replace(/'/g, "''")}')
Write-Output $res
`;

        try {
            fs.writeFileSync(tempScriptPath, script, 'utf-8');
            await new Promise((resolve, reject) => {
                execFile('powershell.exe', [
                    '-NoProfile',
                    '-NonInteractive',
                    '-ExecutionPolicy', 'Bypass',
                    '-File', tempScriptPath
                ], (err, stdout, stderr) => {
                    if (err) {
                        reject(new Error(`PowerShell error: ${stderr || err.message}`));
                    } else if (stdout.trim().toLowerCase() !== 'true') {
                        reject(new Error(`PowerShell returned unexpected output: ${stdout.trim()}`));
                    } else {
                        resolve();
                    }
                });
            });
        } finally {
            try {
                fs.unlinkSync(tempScriptPath);
            } catch (_) {}
        }
        return;
    }

    if (platform === 'linux') {
        // Try secret-tool
        const available = await checkCommandAvailable('secret-tool');
        if (available) {
            await new Promise((resolve, reject) => {
                const proc = require('child_process').spawn(
                    'secret-tool',
                    ['store', '--label=gemini', 'service', 'gemini', 'username', 'antigravity'],
                    { stdio: ['pipe', 'ignore', 'ignore'] }
                );
                proc.stdin.write(payload);
                proc.stdin.end();
                proc.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`secret-tool exited with code ${code}`));
                    }
                });
                proc.on('error', reject);
            });
            return;
        }
    }

    // Fallback: note that on unsupported platforms we fall through to SQLite injection only.
    console.warn('[account_manager] Credential store not available on this platform; using SQLite injection only.');
}

// ─── Shell Helpers ────────────────────────────────────────────────────────────

function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(stderr || err.message));
            } else {
                resolve(stdout);
            }
        });
    });
}

async function checkCommandAvailable(cmd) {
    try {
        await runCommand(os.platform() === 'win32' ? `where ${cmd}` : `which ${cmd}`);
        return true;
    } catch {
        return false;
    }
}

async function resolvePythonCommand() {
    for (const cmd of ['python3', 'python']) {
        if (await checkCommandAvailable(cmd)) {
            return cmd;
        }
    }
    return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

module.exports = {
    loadAccounts,
    saveAccounts,
    getNextNumericId,
    findAccount,
    startOAuthServer,
    buildAuthUrl,
    exchangeCode,
    getUserInfo,
    refreshAccessToken,
    fetchQuota,
    fetchProjectContext,
    ensureFreshToken,
    injectTokenIntoIde,
    writeToCredentialStore,
    getStatevscdbPaths,
    OAUTH_PORT,
    logInfo,
};
