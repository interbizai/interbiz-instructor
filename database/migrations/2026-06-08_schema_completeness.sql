-- ════════════════════════════════════════════════════════════════════════════
--  스키마 완전성 보강 (2026-06-08) — 누락된 테이블·컬럼 일괄 점검·추가
--  사용법: Supabase SQL Editor 에 붙여넣고 RUN — 1회 (안전 idempotent)
--  안전: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — 이미 있으면 무시, 데이터 보존
--
--  대상:
--    1) evaluations 의 JSONB 컬럼 (sub_scores·categories·speech_report)
--    2) voice_evals 의 user_id·org_name·edu_type
--    3) notifications 의 모든 컬럼
--    4) portfolio 테이블 (마이페이지 포트폴리오)
--    5) RLS 비활성화 + GRANT (안전망 재확인)
--    6) PostgREST 스키마 캐시 새로고침
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) evaluations 의 핵심 JSONB 컬럼 보강
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS sub_scores JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS speech_report JSONB DEFAULT '{}'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS good JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS bad  JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS upgrade JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS scenarios JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS level_tips JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS teaching_patterns JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS habits JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS engagement_gaps JSONB DEFAULT '[]'::jsonb;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS mood TEXT;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS decibel INTEGER;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS tempo INTEGER;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS org_name TEXT;

-- ─────────────────────────────────────────────────────────────────
-- 2) voice_evals 누락 컬럼 보강
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS org_name TEXT;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS edu_type TEXT;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS tone TEXT;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS student_count INTEGER DEFAULT 0;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS eval_date DATE;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS result_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE voice_evals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────────
-- 3) notifications 테이블 구조 보강
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  type TEXT,
  title TEXT,
  body TEXT,
  link TEXT,
  org_name TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 누락 컬럼 보강 (테이블 있으면 ADD COLUMN IF NOT EXISTS)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS org_name TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 인덱스 (조회 빈번)
CREATE INDEX IF NOT EXISTS idx_notifications_user      ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);

-- ─────────────────────────────────────────────────────────────────
-- 4) portfolio 테이블 (마이페이지 포트폴리오용)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title TEXT,
  subtitle TEXT,
  file_url TEXT,
  file_name TEXT,
  upload_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio(user_id);

-- ─────────────────────────────────────────────────────────────────
-- 5) app_settings 테이블 (인터픽 Top3·시나리오 draft·hero text 저장용)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- 6) learning_links 의 image_url (직전 마이그레이션 재확인)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE learning_links ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ─────────────────────────────────────────────────────────────────
-- 7) RLS 비활성화 일괄 (안전망)
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users','videos','evaluations','voice_evals','timestamps',
    'calendar_events','learning_links','recommended_videos',
    'pick_contents','pick_notices','pick_featured_videos',
    'checklist_files','notifications','portfolio','app_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    END IF;
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────
-- 8) PostgREST 스키마 캐시 새로고침 (변경 즉시 인식)
-- ─────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────
-- 9) 결과 확인 — 어떤 테이블·컬럼이 있는지 보고
-- ─────────────────────────────────────────────────────────────────
SELECT 'evaluations 핵심 컬럼' AS info;
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='evaluations'
   AND column_name IN ('sub_scores','categories','speech_report','good','bad','upgrade','habits','mood','decibel','tempo','org_name')
 ORDER BY column_name;

SELECT 'voice_evals 핵심 컬럼' AS info;
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='voice_evals'
   AND column_name IN ('user_id','user_name','org_name','edu_type','title','score','tone','student_count','eval_date','result_data')
 ORDER BY column_name;

SELECT 'notifications 핵심 컬럼' AS info;
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='notifications'
 ORDER BY column_name;

SELECT 'portfolio 테이블' AS info;
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='portfolio'
 ORDER BY column_name;

SELECT 'RLS 상태 (false 면 정상)' AS info;
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
   AND c.relname IN ('users','videos','evaluations','voice_evals','notifications','portfolio','app_settings','learning_links')
 ORDER BY c.relname;
