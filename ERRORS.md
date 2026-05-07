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
