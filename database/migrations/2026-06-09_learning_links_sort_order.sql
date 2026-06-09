-- ════════════════════════════════════════════════════════════════════════════
--  learning_links.sort_order 컬럼 추가 — 교육링크 순서 관리
--  사용법: Supabase SQL Editor 에 붙여넣고 RUN — 1회 (안전 idempotent)
--  안전: ADD COLUMN IF NOT EXISTS, 기본값 0
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE learning_links ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 기존 데이터에 created_at 순으로 sort_order 자동 부여 (sort_order=0 인 행만)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY COALESCE(org_name,'__GLOBAL__') ORDER BY created_at ASC) AS new_order
    FROM learning_links
   WHERE COALESCE(sort_order,0)=0
)
UPDATE learning_links ll
   SET sort_order = ordered.new_order
  FROM ordered
 WHERE ll.id = ordered.id;

NOTIFY pgrst, 'reload schema';

-- 확인
SELECT id, name, sort_order, org_name FROM learning_links ORDER BY org_name, sort_order LIMIT 30;
