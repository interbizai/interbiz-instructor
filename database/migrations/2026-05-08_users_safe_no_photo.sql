-- users_safe 뷰에서 photo 컬럼 제외 (페이로드 절감 + 쿼리 안정)
-- 이전 동적 매칭 SQL 과 동일하지만 photo 만 제외
-- /api/users/photos 는 users 테이블 직접 조회로 이미 분리됨

DO $$
DECLARE
  cols text;
BEGIN
  -- public.users 의 컬럼 (pw·photo 제외) → 콤마 연결
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users'
    AND column_name NOT IN ('pw', 'photo');

  IF cols IS NULL OR cols = '' THEN
    RAISE EXCEPTION 'public.users 테이블이 없거나 컬럼을 찾을 수 없습니다';
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.users_safe CASCADE';
  EXECUTE 'CREATE VIEW public.users_safe AS SELECT ' || cols || ' FROM public.users';

  RAISE NOTICE 'users_safe 재생성 (photo 제외). 포함: %', cols;
END $$;

GRANT SELECT ON public.users_safe TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';

-- 검증 — photo 가 들어있지 않아야 정상
SELECT
  CASE WHEN EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users_safe' AND column_name='photo'
  ) THEN '⚠ photo 가 아직 있음 — 재실행 필요'
    ELSE '✓ photo 제외 완료'
  END AS 결과;
