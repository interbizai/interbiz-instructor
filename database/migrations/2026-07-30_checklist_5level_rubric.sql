-- ════════════════════════════════════════════════════════════
-- 2026-07-30  체크리스트 5단계 세부 기준표 저장 지원
-- ════════════════════════════════════════════════════════════
-- 배경: '상반기 하이케어 표준.xlsx' 처럼 세부항목마다
--       5점(매우 우수) / 4점(우수) / 3점(보통) / 2점(미흡) / 1점(매우 미흡)
--       기준 문장이 들어있는 평가표를 그대로 저장하기 위한 컬럼 추가.
--       이 기준 문장이 AI 채점 프롬프트에 그대로 주입되어 점수 인플레이션을 막는다.
--
-- 실행: Supabase SQL Editor 에서 1회
-- 안전: ADD COLUMN IF NOT EXISTS — 기존 데이터/행 영향 없음
-- ════════════════════════════════════════════════════════════

-- 1) 컬럼 추가
ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS scale_max integer,   -- 엑셀 '배점' 열 (5점 척도이면 5)
  ADD COLUMN IF NOT EXISTS levels    jsonb;     -- {"5":"...","4":"...","3":"...","2":"...","1":"..."}

COMMENT ON COLUMN public.checklist_items.scale_max IS
  '엑셀 배점 열. 5단계 척도표면 5. max_score(가산점 반영 배점, 합계 100)와는 별개';
COMMENT ON COLUMN public.checklist_items.levels IS
  '5단계 세부 기준 문장. 키 "5".."1". AI 채점 시 앵커(기준점)로 프롬프트에 주입됨';

-- 2) 권한 (기존 정책과 동일하게)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO anon, authenticated;

-- 3) PostgREST 스키마 캐시 리로드 (신규 컬럼 즉시 인식)
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- 4) 검증 — 컬럼이 생겼는지 확인
-- ════════════════════════════════════════════════════════════
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='checklist_items'
  AND column_name IN ('scale_max','levels');

-- 5) 검증 — 5단계 기준이 들어간 항목 수 (재업로드 후 실행)
SELECT cf.name                                        AS 체크리스트,
       count(*)                                       AS 항목수,
       count(ci.levels)                               AS "5단계기준_보유",
       sum(ci.max_score)                              AS 배점합계
FROM public.checklist_items ci
JOIN public.checklist_files cf ON cf.id = ci.checklist_id
GROUP BY cf.name
ORDER BY cf.name;
