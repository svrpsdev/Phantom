// ── ✅ SERVICE WORKER — COMPLETE FIXED ──

self.addEventListener("install", (event) => {
    console.log('✅ Service Worker installed');
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    // Skip non-GET requests or specific paths
    if (event.request.method !== 'GET' && event.request.method !== 'POST') {
        return;
    }
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const proxyRequestURL = `${self.location.origin}/lNv1pC9AWPUY4gbidyBO`;
    console.log('📤 SW Proxying:', request.url);

    try {
        // Read request body only if it's a POST
        let body = null;
        if (request.method === 'POST') {
            try {
                body = await request.text();
            } catch (e) {
                body = null;
            }
        }

        const proxyRequest = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: body,
            referrer: request.referrer,
            mode: request.mode
        };

        const response = await fetch(proxyRequestURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(proxyRequest),
            mode: "same-origin"
        });

        // ✅ Handle redirects properly
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('Location');
            if (location) {
                console.log('🔄 SW Redirecting to:', location);
                return new Response(null, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: {
                        'Location': location,
                        ...Object.fromEntries(response.headers.entries())
                    }
                });
            }
        }

        // ✅ Clone response to avoid "already consumed" errors
        const clonedResponse = response.clone();
        
        // ✅ If it's HTML, we could inject our own content
        const contentType = clonedResponse.headers.get('Content-Type') || '';
        if (contentType.includes('text/html')) {
            // Optionally modify HTML here
            // const html = await clonedResponse.text();
            // return new Response(html, { status: response.status, headers: response.headers });
        }

        return response;

    } catch (error) {
        console.error('❌ SW Fetch error:', error);
        return new Response('Proxy error', { 
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}
