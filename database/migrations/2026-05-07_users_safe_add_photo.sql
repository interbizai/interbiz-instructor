-- users_safe 뷰에 photo 컬럼 누락 → 새로고침 시 프로필 사진 사라지는 버그 수정
-- 실행: Supabase SQL Editor 에서 1회 실행
-- 안전: 실제 users 테이블에 존재하는 컬럼만 동적으로 포함 (없는 컬럼은 자동 제외)
--       단, 'pw' 만 의도적으로 제외 (보안)

DO $$
DECLARE
  cols text;
BEGIN
  -- public.users 의 모든 컬럼명 조회 (pw 제외) → 콤마로 연결
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name <> 'pw';

  IF cols IS NULL OR cols = '' THEN
    RAISE EXCEPTION 'public.users 테이블이 없거나 컬럼을 찾을 수 없습니다';
  END IF;

  -- VIEW 재생성 (CREATE OR REPLACE 는 컬럼 갯수/이름 변경 시 실패 가능 → DROP 후 CREATE)
  EXECUTE 'DROP VIEW IF EXISTS public.users_safe CASCADE';
  EXECUTE 'CREATE VIEW public.users_safe AS SELECT ' || cols || ' FROM public.users';

  RAISE NOTICE 'users_safe 뷰 재생성 완료. 포함 컬럼: %', cols;
END $$;

COMMENT ON VIEW public.users_safe IS 'users 테이블에서 비밀번호(pw)만 제외하고 노출 — 클라이언트가 SELECT 용도로 사용 (동적 컬럼 매칭)';

-- 검증: photo 컬럼이 뷰에 포함됐는지 확인
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users_safe' AND column_name='photo'
  ) THEN
    RAISE WARNING 'users.photo 컬럼이 존재하지 않습니다. ALTER TABLE public.users ADD COLUMN photo text; 실행 후 이 SQL을 다시 실행하세요.';
  ELSE
    RAISE NOTICE '✓ users_safe.photo 컬럼 노출 확인 완료';
  END IF;
END $$;
