-- 평가 저장 실패 진단 SQL
-- 강사가 영상 평가받았는데 결과가 안 보인다고 보고한 경우 실행
-- 실행: Supabase SQL Editor
-- 안전: SELECT 만 — 변경 없음

-- ════════════════════════════════════════════════════════════
-- 1) evaluations 테이블에 anon/authenticated GRANT 권한이 있는지
-- ════════════════════════════════════════════════════════════
SELECT
  '1. evaluations GRANT 권한' AS 검증_항목,
  grantee,
  privilege_type,
  CASE WHEN grantee IN ('anon','authenticated') AND privilege_type='INSERT'
       THEN '✓' ELSE '' END AS 핵심
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='evaluations'
  AND grantee IN ('anon','authenticated','service_role')
  AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
ORDER BY grantee, privilege_type;

-- ════════════════════════════════════════════════════════════
-- 2) evaluations 테이블에 RLS 가 켜져 있는지 (켜져 있으면 INSERT 차단 위험)
-- ════════════════════════════════════════════════════════════
SELECT
  '2. evaluations RLS 상태' AS 검증_항목,
  relrowsecurity AS rls_활성화,
  CASE WHEN relrowsecurity=false THEN '✓ (정상)' ELSE '⚠ RLS 켜져 있음 - 끄거나 정책 추가 필요' END AS 결과
FROM pg_class WHERE oid='public.evaluations'::regclass;

-- ════════════════════════════════════════════════════════════
-- 3) 최근 24시간 evaluations 저장 추이 (시간대별)
--    문제 발생 시점 파악 — 갑자기 0이 됐는지, 꾸준히 저장되는지
-- ════════════════════════════════════════════════════════════
SELECT
  '3. 시간대별 저장' AS 검증_항목,
  date_trunc('hour', created_at) AS 시간,
  COUNT(*) AS 저장_건수,
  COUNT(DISTINCT video_id) AS 영상_수,
  COUNT(DISTINCT eval_type) AS 평가_타입수,
  string_agg(DISTINCT eval_type, ', ') AS 평가_타입
FROM public.evaluations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY 시간
ORDER BY 시간 DESC;

-- ════════════════════════════════════════════════════════════
-- 4) 최근 evaluations 저장 5개 — 상세 (실제 데이터가 들어가는지)
-- ════════════════════════════════════════════════════════════
SELECT
  '4. 최근 평가 5건' AS 검증_항목,
  id,
  video_id,
  voice_eval_id,
  eval_type,
  overall_score,
  org_name,
  created_at,
  CASE WHEN sub_scores IS NOT NULL AND jsonb_array_length(sub_scores) > 0 THEN '✓' ELSE '✗' END AS 세부점수,
  CASE WHEN speech_report IS NOT NULL AND speech_report != '{}'::jsonb THEN '✓' ELSE '✗' END AS 음성보고서
FROM public.evaluations
ORDER BY created_at DESC
LIMIT 5;

-- ════════════════════════════════════════════════════════════
-- 5) 영상 등록은 됐는데 평가가 없는 케이스 (저장 실패 의심 영상)
--    상태가 '분석완료' 인데 evaluations 가 없으면 → 저장 실패
-- ════════════════════════════════════════════════════════════
SELECT
  '5. 평가 누락 영상' AS 검증_항목,
  v.id AS 영상_id,
  v.title AS 제목,
  v.user_id AS 강사_id,
  u.name AS 강사명,
  u.org_name AS 강사_조직,
  v.status AS 영상상태,
  v.created_at AS 영상등록,
  COUNT(e.id) AS 평가_건수
FROM public.videos v
LEFT JOIN public.evaluations e ON e.video_id = v.id
LEFT JOIN public.users u ON u.id = v.user_id
WHERE v.created_at > NOW() - INTERVAL '7 days'
  AND v.status = '분석완료'
GROUP BY v.id, v.title, v.user_id, u.name, u.org_name, v.status, v.created_at
HAVING COUNT(e.id) < 1
ORDER BY v.created_at DESC
LIMIT 20;

-- ════════════════════════════════════════════════════════════
-- 6) evaluations 컬럼 존재 여부 — 코드가 INSERT 시 사용하는 컬럼 모두 있나
-- ════════════════════════════════════════════════════════════
SELECT
  '6. evaluations 컬럼' AS 검증_항목,
  string_agg(column_name, ', ' ORDER BY ordinal_position) AS 존재_컬럼
FROM information_schema.columns
WHERE table_schema='public' AND table_name='evaluations';

-- ════════════════════════════════════════════════════════════
-- 7) 권한 부족 시 즉시 해결 SQL (필요 시 주석 해제 후 실행)
-- ════════════════════════════════════════════════════════════
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_evals TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.timestamps TO anon, authenticated;
-- ALTER TABLE public.evaluations DISABLE ROW LEVEL SECURITY;
-- NOTIFY pgrst, 'reload schema';
