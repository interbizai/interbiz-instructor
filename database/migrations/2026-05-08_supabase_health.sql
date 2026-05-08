-- Supabase 헬스 체크 + 누락 인덱스 보강
-- 504/522 발생 시 실행 → 어느 테이블이 느린지 + 인덱스 자동 추가

-- ════════════════════════════════════════════════════════════
-- 1) 핵심 테이블 행 수 — 너무 많으면 query 느림 (limit 필요)
-- ════════════════════════════════════════════════════════════
SELECT 'users' AS 테이블, COUNT(*) AS 행수 FROM public.users
UNION ALL SELECT 'videos', COUNT(*) FROM public.videos
UNION ALL SELECT 'evaluations', COUNT(*) FROM public.evaluations
UNION ALL SELECT 'voice_evals', COUNT(*) FROM public.voice_evals
UNION ALL SELECT 'timestamps', COUNT(*) FROM public.timestamps
UNION ALL SELECT 'app_settings', COUNT(*) FROM public.app_settings;

-- ════════════════════════════════════════════════════════════
-- 2) 핵심 인덱스 추가 (없으면) — created_at 기준 정렬·필터 가속
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_evaluations_created_at
  ON public.evaluations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_org_created
  ON public.evaluations (org_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_video_id
  ON public.evaluations (video_id);

CREATE INDEX IF NOT EXISTS idx_voice_evals_created_at
  ON public.voice_evals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_evals_org_created
  ON public.voice_evals (org_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_videos_org_id
  ON public.videos (org_name, id);
CREATE INDEX IF NOT EXISTS idx_videos_user_id
  ON public.videos (user_id);

CREATE INDEX IF NOT EXISTS idx_timestamps_video_id
  ON public.timestamps (video_id);

CREATE INDEX IF NOT EXISTS idx_users_org_name
  ON public.users (org_name);

-- ════════════════════════════════════════════════════════════
-- 3) photo 컬럼 데이터 분포 — 너무 큰 photo 가 있으면 SELECT 무거움
-- ════════════════════════════════════════════════════════════
SELECT
  COUNT(*) AS 전체_사용자,
  COUNT(*) FILTER (WHERE photo IS NOT NULL AND length(photo) > 0) AS 사진_등록,
  AVG(length(photo))::int AS 평균_사진_바이트,
  MAX(length(photo)) AS 최대_사진_바이트,
  SUM(length(photo))/1024/1024 AS 총_사진_MB
FROM public.users;

-- ════════════════════════════════════════════════════════════
-- 4) 통계 갱신 (planner 가 최신 행수 알게)
-- ════════════════════════════════════════════════════════════
ANALYZE public.evaluations;
ANALYZE public.voice_evals;
ANALYZE public.videos;
ANALYZE public.timestamps;
ANALYZE public.users;

-- ════════════════════════════════════════════════════════════
-- 5) PostgREST 스키마 캐시 리로드
-- ════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
