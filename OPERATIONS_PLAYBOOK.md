# 인터픽 운영 플레이북 (Operations Playbook)

> 사이트 장애·기능 오류 발생 시 추측이 아닌 **검증된 절차**로 대응한다.
> 본 문서는 Google SRE Book, AWS Well-Architected, Atlassian Incident Management,
> Microsoft Azure Production Reliability 등 업계 표준 방법론을 인터픽 환경에 맞춰 정리한 것.

---

## 0. 핵심 철학 (4가지)

| # | 원칙 | 의미 |
|---|---|---|
| 1 | **추측 금지** | "아마 이게 문제일 것이다" 로 코드 수정 시작 금지. 항상 검증된 사실에 기반 |
| 2 | **재현 → 격리 → 수정** | 재현 가능한 최소 케이스 먼저 확보 → 원인 격리 → 그 후에 수정 |
| 3 | **2인의 증인** | 최소 2가지 독립적인 신호로 원인 확정 (예: 클라이언트 콘솔 에러 + 서버 로그) |
| 4 | **롤백 우선** | 새 변경 후 장애면 즉시 이전 커밋으로 롤백 → 시간 두고 분석 |

---

## 1. 표준 진단 절차 (Triage Workflow)

### 1단계 — 사실 수집 (Evidence Gathering · 5분)

**필수 정보 5종**:
1. **Who** — 영향받는 사용자 (특정 강사? 전체? 특정 조직?)
2. **What** — 정확한 증상 (에러 메시지, 화면 상태, 콘솔 로그)
3. **When** — 시작 시각 (배포·SQL 마이그레이션 직후? 시간대?)
4. **Where** — 어느 페이지·기능 (영상 분석? 스피치? 시나리오?)
5. **How often** — 100% 재현? 가끔? 특정 조건에서만?

**증거 수집 채널**:
- 사용자 보고 (스크린샷·메시지)
- 브라우저 콘솔 에러 (`F12 → Console`)
- 브라우저 네트워크 탭 (`F12 → Network → 빨간 요청`)
- Vercel Functions 로그 (`vercel.com → 프로젝트 → Functions → Logs`)
- Supabase Database 로그 (`supabase.com → 프로젝트 → Logs → API/Postgres`)
- DB 직접 쿼리 (`Supabase SQL Editor`)

### 2단계 — 가설 수립 (Hypothesis · 5분)

**5 Whys** 기법:
- "왜 저장이 안 되나?" → API 가 401 반환 → "왜 401?" → 토큰 만료 → "왜 만료?" → 24h 경과 …
- 각 "왜?" 마다 **검증 가능한 가설**로

**Failure Mode 카테고리** (인터픽 자주 발생):
| 카테고리 | 신호 | 검증 방법 |
|---|---|---|
| 인증 | 401/403 | F12 → Network → Authorization header |
| 권한 (GRANT) | 42501 permission denied | Supabase SQL: 권한 조회 |
| RLS | 0 rows affected (silent) | RLS 정책 조회 |
| 스키마 미스매치 | column does not exist | information_schema.columns |
| FK 위반 | foreign key violation | 참조 테이블 존재 확인 |
| 페이로드 크기 | 413 / Body too large | Vercel maxDuration / bodyParser sizeLimit |
| 타임아웃 | 504 Gateway Timeout | Vercel Functions log |
| 코드 SyntaxError | 모든 함수 미정의 | F12 → Console 첫 줄 |
| Service Worker 캐시 | 새 코드 미반영 | DevTools → Application → SW 강제 갱신 |

### 3단계 — 검증 (Verify · 10분)

가설별로 **단일 변수만 바꾼 실험**:
- 다른 사용자로 로그인 → 같은 증상? (사용자 권한 vs 글로벌)
- 다른 브라우저 → 증상? (캐시 vs 코드)
- 시크릿 모드 → 증상? (확장 vs 정상)
- 직접 SQL UPDATE → 통과? (RLS vs GRANT vs 스키마)

### 4단계 — 수정 (Fix · 시간 다양)

**원칙**:
- 근본 원인 수정 (증상 가리기 금지)
- 1 commit = 1 fix
- 테스트 가능한 검증 단계 포함
- 영향 범위 명시

### 5단계 — 검증 + 모니터링 (Verify + Monitor · 24h)

**배포 직후**:
- 본인이 실 사용자 행동 모방 (회원 가입 → 로그인 → 사용)
- 콘솔/네트워크 클린한지

**24시간**:
- 같은 에러 재발 여부 모니터링

### 6단계 — 사후 분석 (Postmortem · 30분)

- 무엇이 잘못됐나 (factual)
- 왜 발생했나 (root cause)
- 어떻게 고쳤나 (fix)
- 어떻게 재발 방지하나 (prevention)
- ERRORS.md 에 기록

---

## 2. 인터픽 — 자주 발생하는 5대 장애 패턴

### Pattern A: 저장은 됐다는데 새로고침 시 사라짐

**전형적 원인**:
1. View 에 컬럼 미노출 (e.g., users_safe 에 photo 누락)
2. RLS silent block (update 0 rows, no error)
3. 클라이언트가 캐시된 데이터로 화면 렌더 (DB 반영은 됐는데 다시 안 읽음)

**진단 SQL**:
```sql
-- 직접 DB 에 값이 있는지 확인
SELECT id, [필드명] FROM public.[테이블명] WHERE id=[X];
-- 없으면: 클라이언트 update 가 실패한 것 (RLS/GRANT 의심)
-- 있으면: 클라이언트 read 경로 문제 (View/캐시/select 컬럼 누락)
```

### Pattern B: 일부 사용자만 저장 실패

**전형적 원인**:
1. RLS 정책 미스매치 (특정 조건에서만 차단)
2. 사용자 메타데이터 결손 (org_name 비어있음 등)
3. FK 참조 대상 없음 (해당 사용자의 video_id 가 다른 조직 영상)

**진단**:
```sql
-- 영향받은 사용자의 메타데이터 점검
SELECT id, name, org_name, channel, team FROM public.users WHERE email='...';
-- evaluations 직접 insert 시도 (서비스 키)
```

### Pattern C: SyntaxError 로 모든 기능 정지

**전형적 원인**:
1. 큰 코드 정리 후 if/else 짝 끊김
2. 불완전한 multi-line edit
3. 따옴표·괄호 미스매치

**진단**:
- F12 Console 첫 에러 라인 확인
- 그 라인 위 5줄 / 아래 5줄 확인 (구조적 문제)

**예방**:
- 큰 정리 작업 후 즉시 콘솔 확인 (강력 새로고침)
- 1줄짜리 if/else 분리할 때 양쪽 다 처리

### Pattern D: Vercel 504 Gateway Timeout

**전형적 원인**:
1. RLS 활성화로 anon 쿼리 차단·지연 → 동시 요청 누적
2. Supabase 임시 부하
3. 함수 maxDuration 초과 (대용량 처리)

**진단**:
- Vercel Functions 로그에서 timeout 메시지 확인
- 같은 시점 Supabase 응답 시간

### Pattern E: 새 기능 배포 후 일부 안 보임

**전형적 원인**:
1. dashboard.html vs index.html 파일 혼동 (이전 발생)
2. Service Worker 캐시 (강력 새로고침 필요)
3. 사용자 권한 스코프 (관리자만 보이는 기능 등)

**진단**:
- 어느 파일이 배포본인지 확인 (Vercel 라우팅)
- DevTools → Application → Service Workers → Unregister 후 재시도

---

## 3. 평가(Evaluation) 저장 실패 — 전용 진단 절차

> 강사가 영상/스피치 평가받았는데 결과가 안 보이거나 저장이 안 되는 경우

### 진단 체크리스트 (순서대로)

**Step 1: 클라이언트 측 확인 (1분)**
- [ ] F12 콘솔에 빨간 에러 있나? → 있으면 그 에러부터 수정 (Pattern C)
- [ ] F12 → Network 탭에서 `/api/vertex-analyze` 요청 상태 코드?
  - 200 = 정상 응답
  - 401/403 = 인증 문제 (Pattern Auth)
  - 500 = 서버 에러 → Vercel 로그 확인
  - 504 = 타임아웃 (Pattern D)

**Step 2: API 응답 확인 (1분)**
- [ ] /api/vertex-analyze 응답 body 확인
  - `{ok: true, ...}` = AI 분석 성공
  - `{ok: false, error: "..."}` = AI 분석 실패 → error 메시지 확인

**Step 3: DB 저장 확인 (3분)**
- [ ] Supabase SQL Editor 에서 직접 조회:
  ```sql
  SELECT id, video_id, eval_type, overall_score, created_at
  FROM public.evaluations
  WHERE video_id = [해당 영상 ID]
  ORDER BY created_at DESC LIMIT 5;
  ```
- 행이 있나?
  - 있음 → 클라이언트 read 경로 문제 (Pattern A — View/캐시)
  - 없음 → insert 실패 → Step 4

**Step 4: insert 실패 원인 추적 (5분)**
- [ ] Vercel Functions 로그에서 vertex-analyze 함수 에러 확인
- [ ] 클라이언트 saveEvaluation 함수 내부의 console.warn 확인
- 흔한 원인:
  - **GRANT 누락**: 42501 permission denied → ERRORS.md #3 참조
  - **컬럼 누락**: column "X" does not exist → ALTER TABLE 필요
  - **FK 위반**: video_id/voice_eval_id 참조 대상 없음
  - **org_name 컬럼 충돌**: payload 에 org_name 있는데 테이블 컬럼 없음 → 자동 fallback 됨

**Step 5: 재현 시도 (5분)**
- [ ] 본인 계정으로 동일 플로우 시도
- [ ] 시크릿 모드로 시도
- [ ] 다른 영상으로 시도
- 재현 성공: 100% 버그 → 코드 수정
- 재현 실패: 사용자 환경 문제 (브라우저 캐시·확장 등)

---

## 4. 인터픽 영구 모니터링 (운영 권장)

### 즉시 도입 가능
- [ ] **콘솔 에러 자동 수집** (Sentry · 무료 5K 이벤트/월)
- [ ] **Supabase 로그 보관** (28일 기본 → 수동 export 권장)
- [ ] **Vercel 로그 알림** (배포 후 30분간 5xx 비율 모니터링)

### 권장 추가
- [ ] Health check 엔드포인트 (`/api/health` → DB 연결 + 핵심 테이블 SELECT)
- [ ] 일일 자동 SQL — 어제 evaluations insert 카운트 vs 그 전 7일 평균 (이상치 감지)

---

## 5. 본 문서의 사용

1. 장애 보고 받음 → 본 문서 1·2 절 따라 진단
2. 알려진 패턴이면 해당 진단 절차로 빠르게 대응
3. 새로운 패턴이면 본 문서에 추가
4. 매 배포 후 본 문서의 "평가 저장 실패" 섹션을 한 번 셀프 점검

> **이 문서는 살아있는 문서입니다.** 새 장애 패턴 발견 시 즉시 추가하세요.
