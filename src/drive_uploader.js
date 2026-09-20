const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Checks if Google Drive integration is configured via environment variables
 */
function decodeValue(val) {
    if (!val) return '';
    const trimmed = val.trim();
    if (trimmed.includes('apps.googleusercontent.com') || trimmed.startsWith('GOCSPX-')) {
        return trimmed;
    }
    try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
        if (decoded.includes('apps.googleusercontent.com') || decoded.startsWith('GOCSPX-')) {
            return decoded;
        }
    } catch (e) {}
    return trimmed;
}

/**
 * Checks if Google Drive integration is configured via environment variables
 */
function isConfigured() {
    return !!(
        process.env.GDRIVE_REFRESH_TOKEN ||
        (process.env.GDRIVE_SERVICE_ACCOUNT_PATH || process.env.GDRIVE_SERVICE_ACCOUNT_PAT || process.env.GDRIVE_SERVICE_ACCOUNT_KEY)
    );
}

/**
 * Parses Service Account credentials from JSON string, base64 string, or file path
 */
function getServiceAccountCredentials() {
    const keyPath = process.env.GDRIVE_SERVICE_ACCOUNT_PATH || process.env.GDRIVE_SERVICE_ACCOUNT_PAT;
    if (keyPath) {
        const candidates = [
            path.resolve(keyPath),
            path.resolve(__dirname, '..', keyPath),
            path.resolve(process.cwd(), keyPath)
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                try {
                    return JSON.parse(fs.readFileSync(candidate, 'utf8'));
                } catch (err) {
                    console.error('[gdrive] Error reading service account JSON file:', err.message);
                }
            }
        }
    }
    if (process.env.GDRIVE_SERVICE_ACCOUNT_KEY) {
        const raw = process.env.GDRIVE_SERVICE_ACCOUNT_KEY.trim();
        if (raw.startsWith('{')) {
            return JSON.parse(raw);
        }
        try {
            const decoded = Buffer.from(raw, 'base64').toString('utf8');
            return JSON.parse(decoded);
        } catch (e) {
            return JSON.parse(raw);
        }
    }
    return null;
}

/**
 * Creates a signed JWT for Google Service Account OAuth2
 */
function createServiceAccountJwt(creds) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Claim = Buffer.from(JSON.stringify(claimSet)).toString('base64url');
    const signatureInput = `${b64Header}.${b64Claim}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer.sign(creds.private_key, 'base64url');

    return `${signatureInput}.${signature}`;
}

/**
 * Obtains an access token for Google API requests
 */
async function getAccessToken() {
    const now = Date.now();
    if (cachedToken && tokenExpiry > now + 60000) {
        return cachedToken;
    }

    // 1. Prefer user OAuth refresh token (has real 15GB user quota)
    if (process.env.GDRIVE_REFRESH_TOKEN) {
        const clientId = decodeValue(process.env.GDRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID);
        const clientSecret = decodeValue(process.env.GDRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET);
        
        if (clientId && clientSecret) {
            const postData = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: process.env.GDRIVE_REFRESH_TOKEN.trim(),
                grant_type: 'refresh_token'
            }).toString();

            const res = await requestJson('oauth2.googleapis.com', '/token', 'POST', {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }, postData);

            if (res && res.access_token) {
                cachedToken = res.access_token;
                tokenExpiry = now + ((res.expires_in || 3600) * 1000);
                return cachedToken;
            }
            throw new Error(res && res.error_description ? res.error_description : 'Failed to refresh Google OAuth2 token');
        }
    }

    // 2. Service Account fallback
    const creds = getServiceAccountCredentials();
    if (creds) {
        const assertion = createServiceAccountJwt(creds);
        const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`;
        const res = await requestJson('oauth2.googleapis.com', '/token', 'POST', {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }, postData);

        if (res && res.access_token) {
            cachedToken = res.access_token;
            tokenExpiry = now + ((res.expires_in || 3600) * 1000);
            return cachedToken;
        }
        throw new Error(res && res.error_description ? res.error_description : 'Failed to authenticate Google Service Account');
    }

    throw new Error('Google Drive is not configured. Missing Service Account or OAuth credentials.');
}

/**
 * Helper to make HTTPS requests returning parsed JSON
 */
function requestJson(hostname, path, method = 'GET', headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            path,
            method,
            headers: {
                ...headers,
                'User-Agent': 'AntigravityTelegramSuite/3.8'
            },
            timeout: 30000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.error?.message || `HTTP ${res.statusCode}: ${data}`));
                    }
                } catch (e) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request to Google API timed out'));
        });

        if (body) {
            req.write(body);
        }
        req.end();
    });
}

/**
 * Uploads a screenshot buffer to Google Drive and shares public view link
 * @param {Buffer} buffer - Screenshot JPEG buffer
 * @param {string} filename - Target filename
 * @returns {Promise<{ fileId: string, webViewLink: string, directLink: string }>}
 */
async function uploadScreenshot(buffer, filename = `screenshot_${Date.now()}.jpg`) {
    const token = await getAccessToken();
    const folderId = process.env.GDRIVE_FOLDER_ID;

    const metadata = {
        name: filename,
        mimeType: 'image/jpeg'
    };
    if (folderId && /^[a-zA-Z0-9_-]{15,40}$/.test(folderId)) {
        metadata.parents = [folderId];
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody = Buffer.concat([
        Buffer.from(
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: image/jpeg\r\n' +
            'Content-Transfer-Encoding: base64\r\n\r\n'
        ),
        Buffer.from(buffer.toString('base64')),
        Buffer.from(closeDelimiter)
    ]);

    let uploadRes;
    try {
        uploadRes = await requestJson(
            'www.googleapis.com',
            '/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink',
            'POST',
            {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
                'Content-Length': multipartRequestBody.length
            },
            multipartRequestBody
        );
    } catch (uploadErr) {
        if (metadata.parents) {
            console.warn(`[gdrive] Upload to folder ${folderId} failed (${uploadErr.message}), retrying to root drive...`);
            delete metadata.parents;
            const rootRequestBody = Buffer.concat([
                Buffer.from(
                    delimiter +
                    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                    JSON.stringify(metadata) +
                    delimiter +
                    'Content-Type: image/jpeg\r\n' +
                    'Content-Transfer-Encoding: base64\r\n\r\n'
                ),
                Buffer.from(buffer.toString('base64')),
                Buffer.from(closeDelimiter)
            ]);
            uploadRes = await requestJson(
                'www.googleapis.com',
                '/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink',
                'POST',
                {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                    'Content-Length': rootRequestBody.length
                },
                rootRequestBody
            );
        } else {
            throw uploadErr;
        }
    }

    const fileId = uploadRes.id;

    // Set permission to anyone with link can view
    try {
        await requestJson(
            'www.googleapis.com',
            `/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
            'POST',
            {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            JSON.stringify({
                role: 'reader',
                type: 'anyone'
            })
        );
    } catch (permErr) {
        console.warn('[gdrive] Setting public permission failed:', permErr.message);
    }

    // Retrieve webViewLink
    let webViewLink = uploadRes.webViewLink;
    if (!webViewLink) {
        const fileInfo = await requestJson(
            'www.googleapis.com',
            `/drive/v3/files/${fileId}?supportsAllDrives=true&fields=webViewLink,webContentLink`,
            'GET',
            { 'Authorization': `Bearer ${token}` }
        );
        webViewLink = fileInfo.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
    }

    return {
        fileId,
        webViewLink,
        directLink: `https://drive.google.com/uc?id=${fileId}`
    };
}

/**
 * Cleans up screenshots in Google Drive older than specified days (Default: 7 days)
 * @param {number} days - TTL in days
 * @returns {Promise<number>} Number of deleted files
 */
async function cleanupOldScreenshots(days = 7) {
    if (!isConfigured()) return 0;
    try {
        const token = await getAccessToken();
        const folderId = process.env.GDRIVE_FOLDER_ID;
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        let query = `trashed = false and mimeType != 'application/vnd.google-apps.folder' and createdTime < '${cutoffDate}'`;
        if (folderId && /^[a-zA-Z0-9_-]{15,40}$/.test(folderId)) {
            query += ` and '${folderId}' in parents`;
        }

        const listRes = await requestJson(
            'www.googleapis.com',
            `/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&pageSize=100`,
            'GET',
            { 'Authorization': `Bearer ${token}` }
        );

        const files = listRes.files || [];
        let deletedCount = 0;

        for (const file of files) {
            try {
                await requestJson(
                    'www.googleapis.com',
                    `/drive/v3/files/${file.id}?supportsAllDrives=true`,
                    'DELETE',
                    { 'Authorization': `Bearer ${token}` }
                );
                deletedCount++;
            } catch (delErr) {
                console.warn(`[gdrive] Failed to delete expired file ${file.id}:`, delErr.message);
            }
        }

        if (deletedCount > 0) {
            console.log(`[gdrive] Cleaned up ${deletedCount} screenshot(s) older than ${days} days.`);
        }
        return deletedCount;
    } catch (err) {
        console.warn('[gdrive] Error during scheduled cleanup:', err.message);
        return 0;
    }
}

module.exports = {
    isConfigured,
    getAccessToken,
    createServiceAccountJwt,
    getServiceAccountCredentials,
    uploadScreenshot,
    cleanupOldScreenshots
};
