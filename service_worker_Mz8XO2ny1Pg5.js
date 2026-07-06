// ── ✅ SERVICE WORKER ──
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker installed');
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Only handle navigation requests
    if (event.request.mode === 'navigate') {
        event.respondWith(handleNavigation(event.request));
    } else {
        event.respondWith(fetch(event.request));
    }
});

async function handleNavigation(request) {
    const proxyUrl = `${self.location.origin}/lNv1pC9AWPUY4gbidyBO`;
    
    try {
        const proxyRequest = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: await request.text().catch(() => null),
            referrer: request.referrer,
            mode: request.mode
        };
        
        const response = await fetch(proxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(proxyRequest),
            mode: "same-origin"
        });
        
        return response;
    } catch (error) {
        console.error('❌ Proxy error:', error);
        return fetch(request);
    }
}
