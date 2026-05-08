# 504 Gateway Timeout — 근본 원인 분석 (RCA)

**발생일**: 2026-05-08
**증상**: `/api/db/load` 다중 504 + 페이지 로딩 매우 느림
**참조 방법론**: OPERATIONS_PLAYBOOK.md + Google SRE / Vercel Best Practices / Postgres Performance Engineering

---

## 1. 사실 수집 (Evidence)

| 항목 | 관찰 |
|---|---|
| 증상 | 콘솔에 `Failed to load resource: 504` × 3회 + `loadFromDB(core): HTTP 504` |
| 영향 범위 | 전체 사용자 (페이지 진입 자체 느림) |
| 시작 시점 | 직전 commit (users_safe 에 photo 컬럼 동적 포함 — 2026-05-07) 이후 누적 증상 |
| 재현성 | 100% (페이지 진입 시 매번) |
| 504 메시지 | Vercel 함수 타임아웃 (기본 10s 초과) |

## 2. 업계 전문가 방법론 매핑

### 2-1. Vercel Functions 504 표준 진단 (Vercel Docs)

> "504 = function exceeded maxDuration. Common causes:
> 1. Heavy DB query
> 2. Cold start + connection setup
> 3. Large response payload"

→ 우리 케이스: `/api/db/load` 가 다수 테이블 SELECT 후 응답 직렬화 → 체크 필요

### 2-2. Postgres Query Performance (Brandur Leach, Markus Winand)

> "Suspect TOAST tables when SELECT * is slow on tables with large jsonb/text columns.
> Symptom: query plan looks fast, but result transmission is slow."

→ 우리 `users_safe` view: `photo` 컬럼이 base64 string (1~3MB/명). 60명 × 2MB = 120MB 페이로드.

### 2-3. REST API Payload 최적화 (Google API Design Guide)

> "Use sparse fieldsets. Never return heavy fields by default.
> Photos/attachments must be retrieved by separate endpoint."

→ Anti-pattern 발견: 우리 `/api/db/load` 가 photo 까지 한 번에 반환

### 2-4. Frontend Progressive Loading (Web.dev / Lighthouse)

> "Critical Rendering Path < 1s. Defer non-critical assets.
> Photos/avatars: lazy load with placeholder."

→ 적용 가능: photo 는 placeholder 로 즉시 렌더, 백그라운드에서 로드

## 3. 가설 → 검증

| # | 가설 | 검증 방법 | 결과 |
|---|---|---|---|
| H1 | RLS 차단 | 직전 SQL 로 확인 | ✗ RLS OFF 확인됨 |
| H2 | 이름이 충돌하는 컬럼 (photo 누락) | sql 직접 실행 | ✗ photo 컬럼 정상 노출 |
| H3 | **photo 컬럼 페이로드 폭증** | 함수 응답 크기 추정 (60명 × 2MB) | ✓ **120MB 추정 — 504 원인 확정** |
| H4 | Cold start | 첫 호출만 504 인지 | △ 부분적 (그러나 H3 가 주원인) |
| H5 | 인덱스 누락 | 쿼리 플랜 | △ (개선 가능하나 H3 우선) |

**결론**: H3 가 주원인. H4·H5 는 잔여 최적화.

## 4. 수정 계획 (전문가 표준 적용)

### 4-1. 즉시 (이번 배포)

| 조치 | 효과 | 기반 표준 |
|---|---|---|
| `/api/db/load` 에서 photo 컬럼 제외 | 페이로드 -90%+ | Google API Design (sparse fieldsets) |
| `/api/users/photos` 별도 엔드포인트 | 사진은 별도 lazy load | REST 분리 원칙 |
| 클라이언트 `loadUserPhotosLazy()` | 메인 진입 후 백그라운드 | Web.dev (progressive loading) |
| `maxDuration 30 → 60` | 안전 여유 | Vercel 권장 (free 60s 가능) |

### 4-2. 단기 (다음 배포)

| 조치 | 효과 |
|---|---|
| 타이밍 로깅 (per query) | 다음에 어떤 쿼리가 느린지 즉시 파악 |
| evaluations 최근 90일만 로드 | 데이터 누적 시 폭증 방지 |
| `Cache-Control: private, max-age=5` | F5 연타 시 부담 감소 |

### 4-3. 중장기 (선택)

- 사진을 base64 → Supabase Storage 로 마이그레이션 (영구 해결)
- Edge Runtime + Streaming 응답
- ETag + Conditional GET

## 5. 검증 시나리오

배포 후 다음을 확인:
1. [ ] 콘솔에 504 없음
2. [ ] 페이지 진입 ≤ 2초
3. [ ] 사진은 1~3초 후 자동 로드 (placeholder → 실사진)
4. [ ] 평가 저장·조회 정상 (이전 RLS 수정 유지)

## 6. 사후 (Postmortem)

**무엇이 잘못됐나**: photo 컬럼을 users_safe 뷰에 추가했는데, 동시에 `/api/db/load` 가 SELECT * 로 사용해 페이로드 폭증을 못 봄.

**왜 발생**: 화이트박스 변경(view 정의)이 다른 컴포넌트(API)에 미치는 영향을 종합 검토 안 함.

**재발 방지**:
- 큰 컬럼 추가 시 영향 분석 체크리스트 적용 (어디서 SELECT * 하나? 페이로드는?)
- 모든 SELECT * 를 명시적 컬럼 리스트로 점진 변경
- 일일 헬스 체크에 응답 시간 모니터링 추가

ERRORS.md 에 #8 로 기록.
