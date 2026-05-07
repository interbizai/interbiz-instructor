-- 긴급 롤백: users 테이블 RLS 비활성화 (504 Gateway Timeout 원인 제거)
-- ════════════════════════════════════════════════════════════
-- 배경:
--   직전 SQL 에서 ALTER TABLE public.users ENABLE ROW LEVEL SECURITY 를 켰음.
--   그러나 이 앱의 다수 코드 경로가 anon 키로 sb.from('users').select/update 를
--   직접 호출하는 구조 → RLS 정책 미매칭으로 차단/지연 → 동시 요청 누적 → Vercel
--   서버리스 함수 504 타임아웃 발생.
-- 조치:
--   1) users 테이블 RLS 비활성화 (원래 상태로 복귀)
--   2) photo 컬럼/users_safe 뷰 변경은 그대로 유지 (사진 기능은 서비스 키 API 로 저장)
-- ════════════════════════════════════════════════════════════

-- 1) RLS 비활성화 (정책은 남아있어도 RLS off 상태에서는 무시됨)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2) 정책도 정리 (이전에 우리가 만든 정책 제거 — 다른 정책이 있다면 그대로 둠)
DROP POLICY IF EXISTS "users_self_select" ON public.users;
DROP POLICY IF EXISTS "users_self_update" ON public.users;

-- 3) photo 컬럼 + users_safe 뷰는 유지되었는지 확인
DO $$
DECLARE
  has_photo_col boolean;
  has_photo_in_view boolean;
  rls_enabled boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='photo')
    INTO has_photo_col;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users_safe' AND column_name='photo')
    INTO has_photo_in_view;
  SELECT relrowsecurity FROM pg_class WHERE oid='public.users'::regclass
    INTO rls_enabled;

  RAISE NOTICE '────────────────────────────────────';
  RAISE NOTICE '롤백 후 상태';
  RAISE NOTICE '────────────────────────────────────';
  RAISE NOTICE 'users.photo 컬럼:        %', has_photo_col;
  RAISE NOTICE 'users_safe.photo 노출:   %', has_photo_in_view;
  RAISE NOTICE 'users RLS 활성화:        % (false 여야 정상)', rls_enabled;
  RAISE NOTICE '────────────────────────────────────';
  IF has_photo_col AND has_photo_in_view AND NOT rls_enabled THEN
    RAISE NOTICE '✓ 모든 점검 통과 — 사진 기능 사용 가능';
  END IF;
END $$;

-- 4) PostgREST 스키마 리로드 (변경사항 즉시 반영)
NOTIFY pgrst, 'reload schema';
