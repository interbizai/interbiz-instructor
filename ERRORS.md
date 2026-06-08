# 인터픽 에러 기록 (재발 방지용)

이 파일은 앞으로 동일 에러가 재발하지 않도록 모든 의미있는 에러·해결과정을 기록합니다.
새 작업 전 반드시 이 파일을 확인하세요.

---

## 🚨 치명적 에러 #1: dashboard.html vs index.html 파일 불일치

**발생일**: 2026-05-07

**증상**:
- 코드 변경이 화면에 반영되지 않음
- 새 탭/기능을 추가했는데 사용자에게 안 보임

**원인**:
- 프로젝트에 `dashboard.html` (14282줄) 과 `index.html` (16481줄) 두 개의 메인 HTML이 있음
- Vercel 배포는 `index.html` 을 루트 (/) 에 응답
- `dashboard.html` 은 사용되지 않는 (구) 파일이었으나 외형은 유사
- 작업자가 `dashboard.html` 을 수정해도 배포본에 반영 안 됨

**해결**:
- 모든 코드 변경은 **`index.html`** 에 적용해야 함
- `dashboard.html` 은 무시하거나 삭제 (확인 후)

**재발 방지 체크리스트**:
- [ ] 코드 수정 전 `vercel.json` / `package.json` 의 entrypoint 확인
- [ ] Glob 으로 같은 함수가 두 파일에 다 있으면 어느 쪽이 active 인지 git log 로 확인
- [ ] 변경 후 배포된 사이트에서 직접 검증 (브라우저 강력 새로고침 후)

---

## 🚨 치명적 에러 #2: RLS(Row Level Security) 활성화 → 504 Gateway Timeout

**발생일**: 2026-05-07

**증상**:
- `/api/auth/login` 504 Timeout
- `/api/db/load` 504 Timeout
- 로그인 자체 불가

**원인**:
- 보안 강화 목적으로 `ALTER TABLE public.users ENABLE ROW LEVEL SECURITY` 실행
- 이 앱의 다수 코드 경로가 anon 키로 직접 `sb.from('users').select/update` 호출
- RLS 활성화 + 정책 미매칭 → 쿼리 차단/지연 → 동시 요청 누적 → Vercel 함수 타임아웃

**해결**:
```sql
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_self_select" ON public.users;
DROP POLICY IF EXISTS "users_self_update" ON public.users;
NOTIFY pgrst, 'reload schema';
```

**재발 방지 체크리스트**:
- [ ] **RLS 절대 함부로 켜지 말 것**. 이 코드베이스는 RLS 전제로 설계되지 않음.
- [ ] 보안이 필요하면 RLS 대신 **API 라우트(서비스 키)** 통해 권한 체크
- [ ] RLS 켜야 하는 경우 → 모든 anon 클라이언트 호출 경로 점검 후 정책 추가

---

## 🚨 치명적 에러 #3: GRANT 권한 누락 → 42501 permission denied

**발생일**: 2026-05-07

**증상**:
- 콘솔: `PATCH .../rest/v1/users 401 Unauthorized`
- 응답 본문: `{code: '42501', message: 'permission denied for table users'}`
- 사진 업로드 등 모든 users 테이블 UPDATE 실패
- 새로고침 시 변경사항 사라짐

**원인**:
- `users` 테이블의 anon 역할에 UPDATE GRANT 권한이 없음
- (RLS 와 별개의 PostgreSQL 표준 GRANT 누락)

**해결**:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO anon, authenticated;
-- (모든 핵심 테이블에 동일 GRANT)
NOTIFY pgrst, 'reload schema';
```

**재발 방지 체크리스트**:
- [ ] 새 테이블 생성 시 즉시 GRANT 부여
- [ ] 새 컬럼 추가 후 PostgREST 캐시 리로드 (`NOTIFY pgrst, 'reload schema'`)
- [ ] permission denied 에러 보이면 → RLS 가 아니라 GRANT 부터 점검

---

## 🚨 에러 #4: PostgreSQL VIEW 에 컬럼 누락 → 새로고침 시 데이터 사라짐

**발생일**: 2026-05-07

**증상**:
- `users.photo` 는 DB 에 정상 저장
- `users_safe` 뷰 (API 가 SELECT 하는 곳) 에 `photo` 컬럼 미포함
- → 클라이언트 갱신 시 photo 값 못 받음 → 화면에서 사라짐

**원인**:
- `users_safe` VIEW 가 명시적 컬럼 선택 (`SELECT id, name, ...`) 으로 정의됨
- `photo` 컬럼이 후에 users 테이블에 추가됐지만 뷰는 그대로

**해결**:
```sql
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name <> 'pw';

  EXECUTE 'DROP VIEW IF EXISTS public.users_safe CASCADE';
  EXECUTE 'CREATE VIEW public.users_safe AS SELECT ' || cols || ' FROM public.users';
END $$;
```

**재발 방지 체크리스트**:
- [ ] 컬럼 추가 후 그 컬럼을 노출해야 하는 모든 VIEW 도 함께 갱신
- [ ] 가능하면 VIEW 에 `SELECT *` 사용 (단, pw 같은 민감 컬럼은 제외 필요 시 명시)

---

## 🚨 에러 #5: Supabase SQL Editor 에서 DO 블록 RAISE NOTICE 파싱 오류

**발생일**: 2026-05-07

**증상**:
- `ERROR: 42601: syntax error at or near "users"`
- DO 블록 내 `RAISE NOTICE 'users.photo 컬럼: ...'` 의 NOTICE 메시지가 Editor 에서 SQL 로 재해석됨

**원인**:
- Supabase SQL Editor 의 NOTICE 출력 처리 버그 (한국어/특수문자 포함 시)

**해결**:
- DO 블록 + RAISE NOTICE 대신 **단순 SELECT 쿼리** 로 검증 결과를 표로 출력
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns ...) AS has_photo_col,
  ...;
```

**재발 방지 체크리스트**:
- [ ] Supabase SQL Editor 용 SQL 은 가능한 한 단순한 SELECT/INSERT/ALTER 만 사용
- [ ] 검증은 별도 SELECT 쿼리로 (DO 블록 내 RAISE 지양)

---

## 🚨 에러 #7: evaluations 등 핵심 테이블 RLS 자동 ON → 평가 저장 0건 (silent block)

**발생일**: 2026-05-08

**증상**:
- 강사가 영상 분석 받았는데 결과 저장 안 됨
- 클라이언트 콘솔 에러 없음 (saveEvaluation 이 정상 응답 받음)
- DB 직접 조회: `evaluations` 테이블 최근 24시간 INSERT 0건
- 평가 누락 영상도 0건 (videos 테이블 자체에도 INSERT 안 됨)

**진단 절차** (OPERATIONS_PLAYBOOK.md 의 평가 저장 진단 적용):
1. GRANT 권한 확인 → ✓ 정상 (anon/authenticated INSERT 권한 있음)
2. RLS 상태 확인 → ⚠ **ON** (이게 원인)
3. 시간대별 추이 → 24h 0건 일관성 (정책적 차단)

**원인**:
- 누군가/뭔가가 `evaluations`, `videos`, `voice_evals` 등 핵심 테이블의 RLS 를 켰음
  (이 코드베이스는 RLS 전제 설계 아닌데도)
- RLS ON + 정책 없음 → INSERT 가 0행 반영 = 에러 없이 silent block
- 클라이언트는 `error` 만 체크 → 실패 인지 못 함

**해결**:
```sql
-- 23개 핵심 테이블 RLS 일괄 비활성화
ALTER TABLE public.evaluations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_evals DISABLE ROW LEVEL SECURITY;
-- ...
NOTIFY pgrst, 'reload schema';
```
→ 즉시 평가 저장 정상화

**재발 방지**:
- [ ] 클라이언트에서 INSERT 후 **DB select 로 검증** (이미 추가 — runAnalysis 에 verify read)
- [ ] 평가 저장 후 결과 명시적 확인 (`saveResults.filter(r=>!r)`) — 추가됨
- [ ] 정기 RLS 모니터링 (모든 핵심 테이블 RLS=OFF 상태 점검)
- [ ] 본 ERRORS.md #2, #7 둘 다 RLS 가 원인 — 이 코드베이스는 RLS 켜면 안 됨을 강조

**관련 파일**:
- `database/migrations/2026-05-08_eval_save_diagnostic.sql` — 진단 쿼리 7종
- `database/migrations/2026-05-08_fix_eval_rls_block.sql` — RLS 일괄 OFF + GRANT 보강
- `OPERATIONS_PLAYBOOK.md` — 향후 동일 패턴 대응 절차

---

## 🚨 에러 #6: Anon 클라이언트 update 에서 silent block (no error, no rows affected)

**발생일**: 2026-05-07

**증상**:
- `sb.from('users').update({photo:...}).eq('id',CU.id)` 호출
- error 없이 정상 응답
- 그러나 실제 DB 에는 변경 없음 (RLS 가 행 매칭 0개로 silent block)

**원인**:
- Supabase RLS 는 update/delete 에서 매칭되는 행이 0개여도 에러 없이 빈 결과 반환
- 클라이언트는 `error` 만 체크 → 실패 인지 못 함

**해결**:
- 사진처럼 중요한 업데이트는 **API 라우트(서비스 키)** 로 우회
- API 가 update 후 `select` 로 검증한 결과 (`saved:true`, `length:N`) 반환
- 클라이언트는 이 검증 결과 확인

**재발 방지 체크리스트**:
- [ ] anon 클라이언트로 update 한 뒤 **재조회로 실제 반영 확인**
- [ ] 또는 API 라우트(서비스 키) 사용 + 검증 결과 응답

---

## 📋 SQL 마이그레이션 실행 순서 (이 프로젝트)

신규 환경 설정 시 다음 순서로 실행:

1. `2026-04-30_perf_optimize.sql` — 인덱스·성능 최적화
2. `2026-05-07_add_thumbnail_url.sql` — 교육링크 썸네일 + 시나리오 axes 테이블
3. `2026-05-07_users_safe_add_photo.sql` — users_safe 뷰 동적 재생성
4. `2026-05-07_grant_users_permissions.sql` — anon/authenticated GRANT 복구
5. **(❌ 실행 금지)** `2026-05-07_photo_diagnose_fix.sql` — 이건 RLS 켜는 SQL, 실행하면 #2 에러 발생
6. `2026-05-07_rollback_rls_keep_photo.sql` — 이미 RLS 켜진 환경 롤백용

---

## 🛡 일반 원칙 (Hard Lessons Learned)

1. **두 개의 entrypoint HTML 파일 동시 존재 위험**
   → 작업 전 어느 게 active 인지 확인. 가능하면 한쪽 삭제.

2. **Supabase RLS 는 신중히**
   → 코드베이스가 RLS 전제로 설계되지 않으면 켜지 말 것
   → 보안은 API 라우트 + 서비스 키로 처리

3. **GRANT 와 RLS 는 별개**
   → permission denied 보이면 GRANT 부터 의심
   → RLS off 상태에서도 GRANT 없으면 거부됨

4. **Silent failure 주의**
   → Supabase update/delete 는 error 없이 0행 반영 가능
   → 중요한 작업은 API 라우트로 우회 + 검증

5. **PostgREST 스키마 캐시**
   → 컬럼/뷰 변경 후 `NOTIFY pgrst, 'reload schema'` 호출
   → 안 그러면 새 스키마 인식까지 지연

6. **NOTICE 메시지 한국어 주의**
   → Supabase SQL Editor 가 한국어 NOTICE 출력을 SQL 로 재파싱할 수 있음
   → DO 블록 내 RAISE 보다 단순 SELECT 검증 권장

---

## 🚨 에러 #9: localStorage QuotaExceeded — 로그인 무한 로딩 (2026-05-11)

**증상**:
- 특정 강사 (사진 등록자) 로그인 시 화면이 "로그인 중" 영원히
- API 자체는 200 OK 정상 응답
- 콘솔: `QuotaExceededError: Failed to execute 'setItem' on 'Storage'`

**원인**:
- `localStorage.setItem('ib_user', JSON.stringify(CU))` 시 user 객체가 5MB 초과
- CU.photo 가 base64 (1~3MB), scores·habits 등 다른 큰 필드 누적
- setItem throw → doLogin 의 hideLoginLoading 호출 전 멈춤

**해결**:
```js
function saveStoredUser(u){
  // photo·scores 등 큰 필드 제외 후 저장 (3단계 폴백)
  const{photo, scores, maxes, habits, ...lite}=u;
  localStorage.setItem('ib_user', JSON.stringify(lite));
}
// 모든 ib_user 저장처(9곳) → saveStoredUser() 로 통일
```

**근본 fix**: 사진을 base64 가 아닌 Storage URL 로 저장 (에러 #11 참조)

**재발 방지**:
- [ ] localStorage 에는 큰 데이터(>100KB) 저장 금지
- [ ] 사용자 정보는 핵심 필드만 (id·name·email·역할)
- [ ] 큰 데이터는 DB / Storage / sessionStorage 사용

---

## 🚨 에러 #10: 화면 입력 칸 있는데 저장 안 됨 (silent fail · 다중 발생)

**증상 패턴**:
- 관리자 → 강사 수정 → 이메일 입력 → 저장 → "성공" 알림 → 실제 변경 안 됨
- 마이페이지 사진 등록 → "저장" → 새로고침 시 사라짐
- 영상 분석 등록 → 결과 안 보임

**원인 (모두 동일 패턴)**:
- 입력 칸은 모달에 만들었는데 저장 함수 fields 객체에 해당 필드 누락
- `submitEditUser`: email 입력 칸 있는데 fields 에 email 없음
- `dbUpdateUser`: error console.error 만 하고 return → 호출자가 실패 인지 못 함
- `dbCreateVideo`: error 시 null 반환 → 호출자가 null 검증 안 함

**해결 (공통)**:
1. 모달 입력 칸과 저장 함수 fields 객체 1:1 매핑 확인
2. dbUpdate 후 select 로 검증 read
3. 실패 시 즉시 alert + 정확한 원인

**적용한 6가지 silent fail fix (2026-05-08~11)**:
| # | 기능 | 검증 |
|---|---|---|
| 1 | saveEvaluation | DB read 로 row 확인 |
| 2 | uploadMyPhoto | API saved:true + view read |
| 3 | submitEditUser (관리자 강사 수정) | select 로 email 변경 확인 |
| 4 | resetPw (관리자 PW 초기화) | pw 컬럼 확인 |
| 5 | changeMyPassword (마이페이지) | bcrypt.compare 매칭 |
| 6 | runAnalysis (영상 등록) | vidRow.id null 검증 |

**재발 방지**:
- [ ] 모든 모달 저장 후 → select 로 DB 재확인
- [ ] dbUpdate 류 함수는 결과 객체 또는 throw (silent return 금지)
- [ ] silent fail = console.error 만 하고 호출자 모르게 return 하는 패턴

---

## 🚨 에러 #11: 사진 base64 DB 저장 → API 응답 폭증·504

**증상**:
- /api/db/load 응답 60MB+ → 페이지 진입 2~5초
- localStorage 5MB 한도 초과로 무한 로딩 (에러 #9 와 연동)
- 일부 사진은 3MB 초과로 업로드 자체 실패

**원인**:
- users.photo 컬럼에 base64 (data:image/...) 저장
- 1명당 1~3MB → 17명 × 평균 1MB = 17MB
- /api/db/load 가 photo 포함 SELECT * → 응답 본문 폭증

**해결 (2026-05-11)**:
1. **Supabase Storage `user_photos` 버킷 생성** (13MB 상한, public, CDN)
2. **`/api/auth/update-photo`** 가 dataURL 받으면 → Storage 업로드 → 공개 URL 만 DB 저장
3. **`/api/admin/migrate-photos`** 1회 호출로 기존 17명 일괄 이전
4. **클라이언트 자동 압축** (`compressImage`): 1MB 초과 사진 → Canvas 로 자동 축소 (800px 한도, JPEG 0.3~0.85 품질)
5. **`<img loading="lazy">`** 적용: viewport 들어올 때만 로드

**결과**:
- API 응답: 17MB → ~1.5KB (99.99% 감소)
- 페이지 진입: 3~5초 → 1~2초
- localStorage quota 문제 자동 해결
- 사진은 Supabase CDN (글로벌 분산)

**재발 방지**:
- [ ] **DB 컬럼에 base64 이미지 절대 저장 금지** — 항상 Storage URL
- [ ] 신규 이미지 업로드는 항상 클라이언트 압축 후 (1MB 이하)
- [ ] DB SELECT * 시 큰 컬럼은 명시적 제외 또는 별도 엔드포인트

---

## 🚨 에러 #12: 일관성 결함 — 이메일 대소문자·공백

**증상**:
- 'User@Example.COM' 으로 등록 → 'user@example.com' 로 로그인 시도 → "이메일 없음" 거부

**원인**:
- DB 와 입력값 비교 시 case-sensitive

**해결 (2026-05-11)**:
- `login.js`: `email.toLowerCase()` + ilike 검색
- `create-user.js`: 등록 시 `email.toLowerCase()`
- `submitEditUser`: 이메일 변경 시 `toLowerCase()`

**재발 방지**:
- [ ] 모든 식별자(email·username) 는 DB 저장·비교 시 lowercase 통일
- [ ] 비교 전 trim() + toLowerCase()

---

## 📋 일반 원칙 (Hard Lessons — 추가됨)

7. **DB 컬럼에 큰 바이너리(base64·blob) 저장 금지**
   → 항상 Storage URL · CDN 활용
   → SELECT * 시 응답 폭증 원천 차단

8. **localStorage 는 핵심 메타 정보만**
   → 사용자 정보 = id·name·email·역할
   → 큰 데이터 (사진·캐시) 는 sessionStorage / IndexedDB / DB

9. **모든 저장 작업은 검증 read**
   → "성공 응답 받음" ≠ "실제 저장됨"
   → 응답 후 1회 더 select 로 확인

10. **silent fail 패턴 박멸**
    → console.error 만 하고 return 절대 금지
    → throw 또는 결과 객체 반환 ({ok, error})

11. **이메일·아이디 정규화 일관성**
    → 저장·비교 모두 lowercase + trim
    → 등록·로그인·변경 시 동일 규칙

12. **이미지 자동 압축**
    → 사용자가 큰 사진 올려도 클라이언트에서 자동 축소
    → Canvas API + 점진 품질 (0.85→0.3) 로 1MB 이하 보장

13. **네트워크 재시도 — POST 의 idempotency 구분**
    → 5xx·network 오류만 재시도 (4xx 즉시 반환)
    → 읽기·idempotent POST (login, update-photo, refresh) 만 재시도 OK
    → 생성·결제·분석같은 비-idempotent POST 는 재시도 금지 (중복 실행 위험)
    → fetchWithRetry 헬퍼 사용 (index.html, 5078~5109)

14. **토큰 만료 동시 폭주 차단**
    → 고정 24h 만료 → 같은 시각 로그인한 사용자들이 같은 시각 동시 만료
    → 해법: 만료 시간에 ±12h jitter 추가 (login.js signToken)
    → 추가: 클라이언트가 만료 24h 전에 /api/auth/refresh 사전 호출

15. **외부 AI(Vertex) 호출은 항상 백오프 wrapper**
    → generateContent 직접 호출 금지
    → generateContentWithBackoff(gm, request, maxAttempts) 사용
    → 429/RESOURCE_EXHAUSTED 시 지수 백오프 + jitter (vertex-analyze.js)

16. **메모이제이션·캐시 — 무효화 시점이 정확해야 함**
    → renderCached 사용 시 cache key 에 모든 의존 입력 포함
    → 데이터 직접 수정(Object.assign(u, fields)) 후 renderXXX 호출 패턴이면
      bumpDataVersion() 도 함께 호출하지 않으면 stale 표시
    → 의심스러우면 메모이제이션 적용 안 하는 게 안전

18. **AI 평가 결과가 단조로우면 → 기본 체크리스트 풍부도 점검**
    → 체크리스트 없이 AI 분석 호출 시 기본 항목이 1~2개면 → 결과 카테고리도 1~2개 (차트 일직선)
    → 최소 6~8개 항목 / 3~4개 카테고리 의 기본값 제공해야 다각형 차트가 의미있게 나옴
    → 사례 (2026-06-08): runVoiceAnalysis 의 fallback checklist 1개 → 발성 안정성·음성 품질 2개만 출력 → 8개로 확장

19. **신규 테이블 추가 시 RLS 비활성화 누락 점검**
    → 인터픽 운영 정책: core 테이블 모두 RLS OFF (#2, #7)
    → notifications, app_settings, learning_links 같은 신규/누락 테이블 발견 시 즉시 ALTER ... DISABLE ROW LEVEL SECURITY + GRANT
    → 증상: "new row violates row-level security policy" 콘솔 경고
    → 알림 안 보내져도 본 기능 진행은 됨 — 그러나 사용자 경험 저하 → 즉시 마이그레이션
    → 사례 (2026-06-08): notifications 테이블 RLS 가 enabled 상태 → notifyAdminsOfUpload 모두 실패

17. **Vercel 함수 maxDuration 과 일시 장애 처리**
    → 인터픽 = **Vercel PRO 플랜** (vertex-analyze maxDuration: 300s, 다른 함수 60s 이하 충분)
    → 504 FUNCTION_INVOCATION_TIMEOUT 가 떴다면 다음 순서로 진단:
       1. 함수 내부 백오프 합 < (maxDuration - 첫 호출 예상 시간) 인지
       2. Vertex/외부 API 자체가 응답 안 했는지 (Google Cloud 일시 장애)
       3. 입력 파일 크기 (큰 영상/음성은 처리 시간 길어짐)
    → **클라이언트 재시도 패턴에 반드시 포함**: 429·500·502·503·504·FUNCTION_INVOCATION_TIMEOUT·timeout·deployment·gateway
    → 재시도 안 함 (영구 실패): 인증 만료(401)·검증 실패(400)·권한(403)·NOT_FOUND(404)
    → 다중 모델/fps 시도 패턴(스피치 분석) 도 동일 일시 장애 정규식으로 통일
    → 사례 (2026-05-28): callVertexAnalyze 가 504 응답을 일시 장애로 인식 못 해 첫 시도 후 즉시 throw → 사용자 alert. 정규식에 504/timeout/deployment 패턴 추가 + JSON 파싱 실패 시도 status code 기반 판단.
