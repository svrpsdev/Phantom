self.addEventListener('fetch', (event) => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const proxyURL = `${self.location.origin}/gateway/a5001019e1a7b99f9604`;

    try {
        // Safely read the body – catch any errors (e.g., navigation requests)
        let body = '';
        try {
            body = await request.text();
        } catch (readError) {
            console.warn('[SW] Could not read request body, using empty string', readError);
            body = '';
        }

        const proxyRequest = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: body,
            referrer: request.referrer,
            mode: request.mode
        };

        const response = await fetch(proxyURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proxyRequest),
            redirect: 'manual',
            mode: 'same-origin'
        });

        // If the proxy returns a redirect, you may want to follow it manually,
        // but for now return it as-is.
        return response;
    } catch (error) {
        console.error('[SW] Fetch failed:', error);
        // Fallback: try a normal fetch of the original request
        return fetch(request);
    }
}
