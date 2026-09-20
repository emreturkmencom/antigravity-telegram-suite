const assert = require('assert');
const crypto = require('crypto');
const driveUploader = require('../src/drive_uploader');

function printResult(name, passed, message) {
    if (passed) {
        console.log(`  ✅ ${name}`);
    } else {
        console.error(`  ❌ ${name}: ${message || 'FAILED'}`);
    }
}

async function runTests() {
    console.log('Testing Google Drive Uploader...');
    let passed = 0;
    let failed = 0;

    // Test 1: isConfigured when empty
    try {
        const origSA = process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
        const origSAPath = process.env.GDRIVE_SERVICE_ACCOUNT_PATH;
        const origClientId = process.env.GDRIVE_CLIENT_ID;
        delete process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
        delete process.env.GDRIVE_SERVICE_ACCOUNT_PATH;
        delete process.env.GDRIVE_CLIENT_ID;
        delete process.env.GDRIVE_CLIENT_SECRET;
        delete process.env.GDRIVE_REFRESH_TOKEN;

        assert.strictEqual(driveUploader.isConfigured(), false);
        printResult('isConfigured returns false when env vars are absent', true);
        passed++;

        // Restore if had any
        if (origSA) process.env.GDRIVE_SERVICE_ACCOUNT_KEY = origSA;
        if (origSAPath) process.env.GDRIVE_SERVICE_ACCOUNT_PATH = origSAPath;
        if (origClientId) process.env.GDRIVE_CLIENT_ID = origClientId;
    } catch (e) {
        printResult('isConfigured returns false when env vars are absent', false, e.message);
        failed++;
    }

    // Test 2: getServiceAccountCredentials from JSON & base64
    try {
        const testCreds = {
            client_email: 'test@serviceaccount.gserviceaccount.com',
            private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n'
        };
        process.env.GDRIVE_SERVICE_ACCOUNT_KEY = JSON.stringify(testCreds);
        assert.strictEqual(driveUploader.isConfigured(), true);
        const parsed = driveUploader.getServiceAccountCredentials();
        assert.strictEqual(parsed.client_email, testCreds.client_email);

        // Test base64 encoded
        process.env.GDRIVE_SERVICE_ACCOUNT_KEY = Buffer.from(JSON.stringify(testCreds)).toString('base64');
        const parsedB64 = driveUploader.getServiceAccountCredentials();
        assert.strictEqual(parsedB64.client_email, testCreds.client_email);

        delete process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
        printResult('getServiceAccountCredentials correctly parses JSON and base64 credentials', true);
        passed++;
    } catch (e) {
        printResult('getServiceAccountCredentials correctly parses JSON and base64 credentials', false, e.message);
        failed++;
    }

    // Test 3: createServiceAccountJwt generation
    try {
        const { privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        const creds = {
            client_email: 'test-agent@google.com',
            private_key: privateKey
        };

        const jwt = driveUploader.createServiceAccountJwt(creds);
        const parts = jwt.split('.');
        assert.strictEqual(parts.length, 3);
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

        assert.strictEqual(header.alg, 'RS256');
        assert.strictEqual(payload.iss, 'test-agent@google.com');
        assert.strictEqual(payload.aud, 'https://oauth2.googleapis.com/token');

        printResult('createServiceAccountJwt produces valid RS256 signed JWT structure', true);
        passed++;
    } catch (e) {
        printResult('createServiceAccountJwt produces valid RS256 signed JWT structure', false, e.message);
        failed++;
    }

    // Test 4: cleanupOldScreenshots returns 0 gracefully when unconfigured
    try {
        delete process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
        delete process.env.GDRIVE_SERVICE_ACCOUNT_PATH;
        delete process.env.GDRIVE_CLIENT_ID;
        const cleaned = await driveUploader.cleanupOldScreenshots(7);
        assert.strictEqual(cleaned, 0);
        printResult('cleanupOldScreenshots handles unconfigured state cleanly', true);
        passed++;
    } catch (e) {
        printResult('cleanupOldScreenshots handles unconfigured state cleanly', false, e.message);
        failed++;
    }

    console.log(`\nTests finished: ${passed} passed, ${failed} failed.\n`);
    if (failed > 0) process.exit(1);
}

runTests();
