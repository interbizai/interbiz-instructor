-- 교육링크 썸네일 컬럼 추가 (다기기 동기화)
-- 실행: Supabase SQL Editor 에서 한 번 실행
-- 안전: IF NOT EXISTS 사용 — 중복 실행 OK

-- 1) learning_links.thumbnail_url
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='learning_links' AND column_name='thumbnail_url'
  ) THEN
    EXECUTE 'ALTER TABLE public.learning_links ADD COLUMN thumbnail_url text';
  END IF;
END $$;

-- 2) AI 시나리오 코치 — 교육유형별 기본 요소 (관리자 세팅) + 사용자별 커스텀 저장
-- 단일 테이블 + scope 컬럼으로 처리 (default = 관리자 기본값, user_<id> = 개인 커스텀)
CREATE TABLE IF NOT EXISTS public.scenario_axes_config (
  id          bigserial PRIMARY KEY,
  scope       text NOT NULL,                 -- 'default' | 'user_<id>'
  edu_type    text NOT NULL DEFAULT '',      -- '' = 전체 기준 (NOT NULL · 일관성 위해 빈 문자열)
  org_name    text NOT NULL DEFAULT '',      -- '' = 공통 (NOT NULL)
  axes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, edu_type, org_name)
);

-- 인덱스 (조회 최적화)
CREATE INDEX IF NOT EXISTS idx_scenario_axes_lookup
  ON public.scenario_axes_config (scope, edu_type, org_name);

-- 3) RLS — 모든 사용자 SELECT 허용, INSERT/UPDATE/DELETE 는 인증된 사용자
ALTER TABLE public.scenario_axes_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scenario_axes select" ON public.scenario_axes_config;
CREATE POLICY "scenario_axes select" ON public.scenario_axes_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "scenario_axes write" ON public.scenario_axes_config;
CREATE POLICY "scenario_axes write" ON public.scenario_axes_config
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() IS NOT NULL)
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() IS NOT NULL);
