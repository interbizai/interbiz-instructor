-- ════════════════════════════════════════════════════════════════════════════
--  learning_links 테이블에 image_url 컬럼 추가
--  목적: 교육 링크 카드의 대표 이미지를 관리자가 직접 등록
--  사용법: Supabase SQL Editor 에 붙여넣고 RUN — 1회만
--  안전: IF NOT EXISTS — 이미 있으면 무시
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE learning_links ADD COLUMN IF NOT EXISTS image_url TEXT;

-- PostgREST 스키마 캐시 새로고침 (Supabase 즉시 인식)
NOTIFY pgrst, 'reload schema';

-- 확인
SELECT 'learning_links.image_url 컬럼 확인' AS info;
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='learning_links' AND column_name='image_url';
