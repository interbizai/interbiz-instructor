-- 긴급 롤백: users 테이블 RLS 비활성화 (504 Gateway Timeout 원인 제거)
-- 실행: Supabase SQL Editor 에서 1회 실행
-- 안전: 모든 문장이 IF EXISTS / IF NOT EXISTS 로 멱등(중복 실행 OK)

-- 1) RLS 비활성화 (이게 504 의 핵심 원인)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2) 직전 SQL 에서 만든 정책 정리 (다른 정책이 있다면 그대로 둠)
DROP POLICY IF EXISTS "users_self_select" ON public.users;
DROP POLICY IF EXISTS "users_self_update" ON public.users;

-- 3) PostgREST 스키마 캐시 리로드 (변경사항 즉시 반영)
NOTIFY pgrst, 'reload schema';

-- 4) 검증 — 결과 표가 출력됨
--    has_photo_col=true, has_photo_in_view=true, rls_enabled=false 여야 정상
SELECT
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='photo'
  ) AS has_photo_col,
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users_safe' AND column_name='photo'
  ) AS has_photo_in_view,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.users'::regclass) AS rls_enabled,
  (SELECT COUNT(*) FROM public.users) AS total_users,
  (SELECT COUNT(*) FROM public.users WHERE photo IS NOT NULL AND length(photo) > 0) AS users_with_photo;
