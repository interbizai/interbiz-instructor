-- ===================================================================
-- 인터픽 성능 최적화 (2026-04-30)
-- 1) vertex_cache 테이블 신규 — AI 분석 결과 재사용
-- 2) 핵심 테이블 인덱스 추가 — org_name / user_id / created_at
--
-- ⚠ Supabase SQL Editor 에서 그대로 실행하세요.
-- ⚠ 모두 IF NOT EXISTS 라 여러 번 실행해도 안전합니다.
-- ===================================================================

-- ─────────────────────────────────────────────────────────
-- 1. vertex_cache 테이블 (AI 분석 캐싱)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vertex_cache (
  cache_key   TEXT PRIMARY KEY,
  eval_type   TEXT,
  model       TEXT,
  result      JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  hit_count   INT DEFAULT 0,
  last_hit_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vertex_cache_created
  ON public.vertex_cache (created_at DESC);

-- 캐시 히트 카운트 함수 (RPC 호출용)
CREATE OR REPLACE FUNCTION public.vertex_cache_hit(p_key TEXT)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.vertex_cache
  SET hit_count = COALESCE(hit_count, 0) + 1,
      last_hit_at = now()
  WHERE cache_key = p_key;
$$;

-- 권한 (anon/authenticated 직접 접근 차단 — 서버에서만 service_role 로 사용)
REVOKE ALL ON public.vertex_cache FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.vertex_cache_hit(TEXT) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 2. 핵심 테이블 인덱스
--    /api/db/load 가 매번 11개 테이블을 org_name + 정렬로 조회 →
--    인덱스 없으면 풀스캔. 데이터 누적될수록 느려짐.
-- ─────────────────────────────────────────────────────────

-- users
CREATE INDEX IF NOT EXISTS idx_users_org              ON public.users (org_name);

-- videos
CREATE INDEX IF NOT EXISTS idx_videos_org             ON public.videos (org_name);
CREATE INDEX IF NOT EXISTS idx_videos_user            ON public.videos (user_id);

-- evaluations
CREATE INDEX IF NOT EXISTS idx_evaluations_org_created
  ON public.evaluations (org_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_video      ON public.evaluations (video_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_user       ON public.evaluations (user_id);

-- voice_evals
CREATE INDEX IF NOT EXISTS idx_voice_evals_org_created
  ON public.voice_evals (org_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_evals_video      ON public.voice_evals (video_id);
CREATE INDEX IF NOT EXISTS idx_voice_evals_user       ON public.voice_evals (user_id);

-- timestamps (videoIds in (...) 조회)
CREATE INDEX IF NOT EXISTS idx_timestamps_video       ON public.timestamps (video_id);

-- 콘텐츠 7종 (모두 org_name + created_at 또는 order_index 정렬)
CREATE INDEX IF NOT EXISTS idx_calendar_org_start
  ON public.calendar_events (org_name, start_time);
CREATE INDEX IF NOT EXISTS idx_learning_links_org_created
  ON public.learning_links (org_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommended_videos_org_created
  ON public.recommended_videos (org_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pick_contents_org_created
  ON public.pick_contents (org_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pick_notices_org_created
  ON public.pick_notices (org_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pick_featured_org_order
  ON public.pick_featured_videos (org_name, order_index);
CREATE INDEX IF NOT EXISTS idx_checklist_files_org_created
  ON public.checklist_files (org_name, created_at DESC);

-- ─────────────────────────────────────────────────────────
-- 3. 캐시 TTL 정리 — 90일 지난 캐시는 자동 삭제 (선택)
--    Supabase pg_cron 이 켜져있어야 동작. 안 켜져있으면 무시.
-- ─────────────────────────────────────────────────────────
-- SELECT cron.schedule(
--   'vertex-cache-cleanup',
--   '0 3 * * *',  -- 매일 새벽 3시
--   $$ DELETE FROM public.vertex_cache WHERE created_at < now() - INTERVAL '90 days'; $$
-- );

-- ─────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 확인용)
-- ─────────────────────────────────────────────────────────
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE schemaname='public' AND indexname LIKE 'idx_%' ORDER BY tablename, indexname;

-- SELECT COUNT(*) AS cached_results FROM public.vertex_cache;
