-- ===================================================================
-- 인터픽 성능 최적화 (2026-04-30) — v2 안전판
-- 1) vertex_cache 테이블 신규 — AI 분석 결과 재사용
-- 2) 핵심 테이블 인덱스 추가 — 컬럼 존재 여부 자동 체크
--
-- ⚠ Supabase SQL Editor 에서 그대로 실행하세요.
-- ⚠ 모두 IF NOT EXISTS + 컬럼 존재 체크라 여러 번 실행해도 안전합니다.
-- ⚠ 일부 컬럼이 없는 테이블이 있어도 다른 인덱스는 정상적으로 만들어집니다.
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
-- 2. 컬럼 존재 시에만 인덱스 생성 (안전 헬퍼)
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._safe_create_index(
  p_index_name TEXT,
  p_table_name TEXT,
  p_columns    TEXT  -- 'col1' or 'col1, col2 DESC'
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  col_list TEXT[];
  col      TEXT;
  bare_col TEXT;
  missing  TEXT := NULL;
BEGIN
  -- 테이블 존재 체크
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=p_table_name
  ) THEN
    RETURN format('SKIP %s: table %I missing', p_index_name, p_table_name);
  END IF;

  -- 컬럼 목록 분리 후 각 컬럼 존재 여부 확인
  col_list := string_to_array(p_columns, ',');
  FOREACH col IN ARRAY col_list LOOP
    -- "col_name DESC" 같은 정렬 키워드 제거 후 컬럼명만 추출
    bare_col := trim(split_part(trim(col), ' ', 1));
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=p_table_name AND column_name=bare_col
    ) THEN
      missing := bare_col;
      EXIT;
    END IF;
  END LOOP;

  IF missing IS NOT NULL THEN
    RETURN format('SKIP %s: column %I.%I missing', p_index_name, p_table_name, missing);
  END IF;

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', p_index_name, p_table_name, p_columns);
  RETURN format('OK %s on %s(%s)', p_index_name, p_table_name, p_columns);
END;
$$;

-- ─────────────────────────────────────────────────────────
-- 3. 인덱스 일괄 생성 — 결과는 NOTICE 로 한 줄씩 보고됨 (OK / SKIP)
-- ─────────────────────────────────────────────────────────
DO $$
DECLARE
  msg TEXT;
BEGIN
  -- users
  msg := public._safe_create_index('idx_users_org', 'users', 'org_name');
  RAISE NOTICE '%', msg;

  -- videos
  msg := public._safe_create_index('idx_videos_org', 'videos', 'org_name');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_videos_user', 'videos', 'user_id');
  RAISE NOTICE '%', msg;

  -- evaluations
  msg := public._safe_create_index('idx_evaluations_org_created', 'evaluations', 'org_name, created_at DESC');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_evaluations_video', 'evaluations', 'video_id');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_evaluations_user', 'evaluations', 'user_id');
  RAISE NOTICE '%', msg;

  -- voice_evals
  msg := public._safe_create_index('idx_voice_evals_org_created', 'voice_evals', 'org_name, created_at DESC');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_voice_evals_video', 'voice_evals', 'video_id');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_voice_evals_user', 'voice_evals', 'user_id');
  RAISE NOTICE '%', msg;

  -- timestamps
  msg := public._safe_create_index('idx_timestamps_video', 'timestamps', 'video_id');
  RAISE NOTICE '%', msg;

  -- 콘텐츠 7종
  msg := public._safe_create_index('idx_calendar_org_start', 'calendar_events', 'org_name, start_time');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_learning_links_org_created', 'learning_links', 'org_name, created_at DESC');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_recommended_videos_org_created', 'recommended_videos', 'org_name, created_at DESC');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_pick_contents_org_created', 'pick_contents', 'org_name, created_at DESC');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_pick_notices_org_created', 'pick_notices', 'org_name, created_at DESC');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_pick_featured_org_order', 'pick_featured_videos', 'org_name, order_index');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_checklist_files_org_created', 'checklist_files', 'org_name, created_at DESC');
  RAISE NOTICE '%', msg;

  -- 알림 (notifications)
  msg := public._safe_create_index('idx_notifications_user', 'notifications', 'user_id');
  RAISE NOTICE '%', msg;
  msg := public._safe_create_index('idx_notifications_user_read', 'notifications', 'user_id, read_at');
  RAISE NOTICE '%', msg;
END $$;

-- ─────────────────────────────────────────────────────────
-- 4. 검증 — 어느 인덱스가 만들어졌는지 한눈에 확인
-- ─────────────────────────────────────────────────────────
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname='public' AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ─────────────────────────────────────────────────────────
-- 5. (선택) 누락된 컬럼 진단용 — 어떤 테이블에 user_id 가 없는지 확인
--    위 DO 블록이 SKIP 메시지를 NOTICE 로 보여주지만,
--    Supabase SQL Editor 에서 NOTICE 가 안 보일 때 이 쿼리로 직접 확인
-- ─────────────────────────────────────────────────────────
-- SELECT t.table_name,
--        EXISTS (SELECT 1 FROM information_schema.columns c
--                WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name='user_id') AS has_user_id,
--        EXISTS (SELECT 1 FROM information_schema.columns c
--                WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name='org_name') AS has_org_name,
--        EXISTS (SELECT 1 FROM information_schema.columns c
--                WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name='video_id') AS has_video_id
-- FROM (VALUES ('users'),('videos'),('evaluations'),('voice_evals'),('timestamps'),
--              ('calendar_events'),('learning_links'),('recommended_videos'),
--              ('pick_contents'),('pick_notices'),('pick_featured_videos'),
--              ('checklist_files'),('notifications')) AS t(table_name)
-- ORDER BY t.table_name;

-- ─────────────────────────────────────────────────────────
-- 6. 캐시 TTL 정리 — 120일 지난 캐시 자동 삭제 (선택, pg_cron 필요)
-- ─────────────────────────────────────────────────────────
-- SELECT cron.schedule(
--   'vertex-cache-cleanup',
--   '0 3 * * *',
--   $$ DELETE FROM public.vertex_cache WHERE created_at < now() - INTERVAL '120 days'; $$
-- );
