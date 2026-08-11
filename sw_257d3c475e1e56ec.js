self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const proxyRequestURL = `${self.location.origin}/gateway/a5001019e1a7b99f9604`;

    try {
        const proxyRequest = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: await request.text(),
            referrer: request.referrer,
            mode: request.mode
        };
        
        return fetch(proxyRequestURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(proxyRequest),
            redirect: "manual",
            mode: "same-origin"
        });
    }
    catch (error) {
        console.error(`Fetching ${proxyRequestURL} failed: ${error}`);
    }
}
