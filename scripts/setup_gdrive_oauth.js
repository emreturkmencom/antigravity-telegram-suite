const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');

function decodeEnvValue(val) {
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

require('dotenv').config({ path: ENV_PATH });

const clientId = decodeEnvValue(process.env.GDRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID);
const clientSecret = decodeEnvValue(process.env.GDRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET);

if (!clientId || !clientSecret) {
    console.error('❌ Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET) are missing from .env');
    process.exit(1);
}

const REDIRECT_PORT = 54321;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent'
}).toString();

console.log('\n======================================================');
console.log('🔗 GOOGLE DRIVE PERSONAL OAUTH SETUP');
console.log('======================================================');
console.log('\n1. Open the following link in your browser to sign in:');
console.log(`\n\x1b[36m${authUrl}\x1b[0m\n`);
console.log('2. Waiting for authentication on local callback...\n');

const server = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);
    if (reqUrl.pathname === '/oauth2callback') {
        const code = reqUrl.query.code;
        if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>✅ Google Drive Connected Successfully!</h1><p>You can close this tab and return to the terminal.</p>');
            
            try {
                const tokenData = await exchangeCodeForTokens(code);
                if (tokenData.refresh_token) {
                    saveRefreshTokenToEnv(tokenData.refresh_token);
                    console.log('✅ Success! GDRIVE_REFRESH_TOKEN saved to .env');
                    console.log('🎉 Your personal Google Drive (15GB quota) is now linked for screenshots!\n');
                } else {
                    console.warn('⚠️ No refresh token returned. (If you previously authorized this app, revoke access or run again with prompt=consent)');
                }
            } catch (err) {
                console.error('❌ Failed to exchange code for tokens:', err.message);
            } finally {
                server.close();
                process.exit(0);
            }
        } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing authorization code');
        }
    }
});

server.listen(REDIRECT_PORT);

function exchangeCodeForTokens(code) {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        }).toString();

        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) reject(new Error(parsed.error_description || parsed.error));
                    else resolve(parsed);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function saveRefreshTokenToEnv(refreshToken) {
    let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    if (envContent.includes('GDRIVE_REFRESH_TOKEN=')) {
        envContent = envContent.replace(/GDRIVE_REFRESH_TOKEN=.*/g, `GDRIVE_REFRESH_TOKEN=${refreshToken}`);
    } else {
        envContent += `\nGDRIVE_REFRESH_TOKEN=${refreshToken}\n`;
    }
    fs.writeFileSync(ENV_PATH, envContent, 'utf8');
}
