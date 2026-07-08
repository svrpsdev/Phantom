// ── ✅ SERVICE WORKER — PROXY ALL REQUESTS ──
const PROXY_URL = '/lNv1pC9AWPUY4gbidyBO';

self.addEventListener('fetch', function(event) {
    const request = event.request;
    
    // Only handle same-origin requests
    if (request.url.startsWith(self.location.origin)) {
        event.respondWith(
            (async function() {
                try {
                    // Forward the request to the proxy endpoint
                    const response = await fetch(PROXY_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: request.url,
                            method: request.method,
                            headers: Object.fromEntries(request.headers.entries()),
                            body: await request.text().catch(() => null)
                        })
                    });
                    return response;
                } catch (error) {
                    console.error('Proxy error:', error);
                    return new Response('Proxy error', { status: 500 });
                }
            })()
        );
    }
});
