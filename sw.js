// 1426 다본문 성경 service worker (youngbaekim.github.io/bible/)
// VERSION is bumped automatically by deploy.ps1 on every deploy.
// 같은 주소(youngbaekim.github.io)의 다른 앱(devotion, utmost 등)과 저장공간을 함께 쓰므로
// 이름이 'bible-'로 시작하는 저장공간만 만들고 지운다.
const VERSION = '20261101-173606';
const SHELL = 'bible-shell-' + VERSION;   // pages, icons: replaced every deploy
const DATA  = 'bible-data-v1';            // bible / commentary JSON: kept across deploys
const FONTS = 'bible-fonts-v1';           // web fonts: kept across deploys
const BYPASS = ['supabase.co', 'bible-api.com', 'bolls.life', 'accounts.google.com'];
const SCOPE = self.registration.scope;    // https://youngbaekim.github.io/bible/

self.addEventListener('install', () => {});  // wait; the page asks before switching

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('bible-') && ![SHELL, DATA, FONTS].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com' ||
  (u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('pretendard'));

function networkFirst(req, cacheName) {
  return fetch(req)
    .then(res => { if (res.ok) { const c = res.clone(); caches.open(cacheName).then(x => x.put(req, c)); } return res; })
    .catch(() => caches.match(req));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (BYPASS.some(d => url.hostname.includes(d))) return;

  if (isFont(url)) {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone()).catch(() => {});
      return res;
    }));
    return;
  }

  if (!req.url.startsWith(SCOPE)) return;   // 다른 앱 경로는 관여하지 않음

  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || req.url === SCOPE) {
    e.respondWith(networkFirst(req, SHELL));
    return;
  }
  if (req.url.startsWith(SCOPE + 'bible/') || req.url.startsWith(SCOPE + 'commentary/')) {
    e.respondWith(networkFirst(req, DATA));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(SHELL).then(x => x.put(req, c)); }
    return res;
  })));
});
