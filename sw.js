// 인터PICK Service Worker — PWA 캐싱 + 오프라인 지원
const VERSION = 'v1.0.3';
const STATIC_CACHE = `interpick-static-${VERSION}`;
const RUNTIME_CACHE = `interpick-runtime-${VERSION}`;

// 앱 셸 (오프라인에서도 즉시 띄울 정적 자원)
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/logo/1_white.png',
  '/assets/logo/logo_1.png',
  '/assets/logo/인터비즈로고.png',
  '/assets/logo/파비콘/1-Photoroom.ico',
];

// 설치 — 앱 셸 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.allSettled(APP_SHELL.map((url) => cache.add(url).catch(() => null)));
    }).then(() => self.skipWaiting())
  );
});

// 활성화 — 옛 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// fetch 전략
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // GET 만 캐싱
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API / Supabase / GCS 는 항상 네트워크 (캐싱 안 함)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('googleusercontent')
  ) {
    event.respondWith(fetch(req).catch(() => new Response('', { status: 503 })));
    return;
  }

  // HTML / 네비게이션 — Stale-While-Revalidate
  // (캐시 즉시 반환으로 첫 진입 빠르게 + 백그라운드에서 새 버전 받아 캐시 갱신 → 다음 새로고침 시 최신)
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached || caches.match('/index.html'));
        return cached || networkPromise;
      })
    );
    return;
  }

  // 정적 자원 (이미지/폰트/스크립트) — Stale-While-Revalidate
  // (캐시 즉시 + 백그라운드 갱신 → 새 배포 후에도 첫 진입 안 느림)
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkPromise = fetch(req)
        .then((res) => {
          if (res && res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkPromise;
    })
  );
});

// 메시지 — 즉시 업데이트 트리거
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
