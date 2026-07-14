// 인터PICK Service Worker — PWA 캐싱 + 오프라인 지원
const VERSION = 'v1.1.3';
const STATIC_CACHE = `interpick-static-${VERSION}`;
const RUNTIME_CACHE = `interpick-runtime-${VERSION}`;

// 앱 셸 (오프라인에서도 즉시 띄울 정적 자원)
// ※ 코드 분할(v1.1.0): CSS/JS 가 별도 파일로 분리됨 — index.html 이 참조하는 ?v 쿼리까지 동일하게 캐싱
const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/login-am.html',
  '/login-hicare.html',
  '/manifest.json',
  '/assets/css/app.css?v1.1.3',
  '/assets/css/login.css',
  '/assets/js/login.js',
  '/assets/js/01-core-db.js?v1.1.3',
  '/assets/js/02-state.js?v1.1.3',
  '/assets/js/03-nav-auth.js?v1.1.3',
  '/assets/js/04-admin-edu.js?v1.1.3',
  '/assets/js/05-home-analysis.js?v1.1.3',
  '/assets/js/06-voice-calendar.js?v1.1.3',
  '/assets/js/07-dashboard-my.js?v1.1.3',
  '/assets/js/08-lecturer.js?v1.1.3',
  '/assets/js/09-admin-panel.js?v1.1.3',
  '/assets/js/10-ui-init.js?v1.1.3',
  '/assets/js/video-protect.js?v1.1.3',
  '/assets/logo/interpick-icon.png',
  '/assets/logo/interpick-logo.png',
  '/assets/logo/1_white.png',
  '/assets/logo/logo_1.png',
  '/assets/logo/인터비즈로고.png',
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

  // HTML / 네비게이션 — Network-First
  // (항상 최신 코드를 우선 받아 강사·관리자가 옛 화면을 보지 않게. 오프라인일 때만 캐시 폴백)
  // ※ 평가/저장 기능은 최신 코드 일치가 중요 → 속도보다 정확성 우선
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
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
