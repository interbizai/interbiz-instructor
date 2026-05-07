-- 긴급: users 테이블의 anon/authenticated GRANT 복구
-- 원인: 401 Unauthorized + 42501 permission denied for table users
-- 직전 SQL(RLS ENABLE/DISABLE) 과는 별개의 GRANT 권한 누락
--
-- 실행: Supabase SQL Editor 1회 실행

-- ════════════════════════════════════════════════════════════
-- 1) users 테이블 표준 권한 복구
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;

-- 시퀀스(id 자동증가)도 동일 권한 부여 — INSERT 시 필요
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.sequences
    WHERE sequence_schema='public' AND sequence_name='users_id_seq'
  ) THEN
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.users_id_seq TO anon, authenticated, service_role';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 2) users_safe 뷰도 SELECT 권한 명시
-- ════════════════════════════════════════════════════════════
GRANT SELECT ON public.users_safe TO anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 3) 다른 핵심 테이블도 일괄 복구 (혹시 같이 빠졌을 가능성 대비)
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timestamps TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_evals TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_links TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommended_videos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_files TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edu_categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edu_types TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenario_axes_config TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 4) PostgREST 스키마 캐시 리로드
-- ════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- 5) 검증 — anon/authenticated 가 users 에 UPDATE 권한 가지는지
-- ════════════════════════════════════════════════════════════
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name='users'
  AND grantee IN ('anon','authenticated','service_role')
  AND privilege_type IN ('SELECT','UPDATE','INSERT','DELETE')
ORDER BY grantee, privilege_type;
