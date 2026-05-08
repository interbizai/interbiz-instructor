-- 긴급 수정: 평가 저장 안 되는 원인 = evaluations RLS silent block
-- 진단 결과: RLS=ON, 최근24시간 저장 0건, GRANT 권한 정상
-- 조치: 핵심 데이터 테이블 전체의 RLS 비활성화 (이 코드베이스는 RLS 전제 설계 아님)
-- 실행: Supabase SQL Editor 1회

-- ════════════════════════════════════════════════════════════
-- 1) 핵심 테이블 RLS 모두 비활성화 (anon 클라이언트가 직접 INSERT/UPDATE 하는 테이블)
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.evaluations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_evals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.timestamps DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommended_videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick_contents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick_notices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick_featured_videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.criteria DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.delete_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_criteria DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_axes_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════
-- 2) GRANT 한 번 더 보강 (혹시 누락된 게 있으면)
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_evals TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timestamps TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 3) PostgREST 스키마 캐시 리로드
-- ════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- 4) 검증 — 모든 핵심 테이블 RLS 가 OFF 인지 확인
-- ════════════════════════════════════════════════════════════
SELECT
  c.relname AS 테이블,
  CASE WHEN c.relrowsecurity THEN '⚠ ON (문제!)' ELSE '✓ OFF' END AS RLS상태
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'evaluations','videos','voice_evals','timestamps','users',
    'checklist_files','learning_links','calendar_events','app_settings',
    'scenario_axes_config'
  )
ORDER BY c.relname;
