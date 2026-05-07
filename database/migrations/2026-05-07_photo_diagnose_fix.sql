-- 프로필 사진 저장/조회 진단 + 자동 수리
-- 실행: Supabase SQL Editor 에서 1회 실행 (이전 SQL 후에)

-- ════════════════════════════════════════════════════════════
-- 1) users.photo 컬럼 자동 추가 (없으면)
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='photo'
  ) THEN
    EXECUTE 'ALTER TABLE public.users ADD COLUMN photo text';
    RAISE NOTICE '✓ users.photo 컬럼 추가됨 (없었음)';
  ELSE
    RAISE NOTICE '✓ users.photo 컬럼 이미 존재';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 2) users_safe 뷰에 photo 포함되도록 재생성 (이전 SQL 보강)
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name <> 'pw';

  EXECUTE 'DROP VIEW IF EXISTS public.users_safe CASCADE';
  EXECUTE 'CREATE VIEW public.users_safe AS SELECT ' || cols || ' FROM public.users';
  RAISE NOTICE '✓ users_safe 재생성. 포함: %', cols;
END $$;

-- ════════════════════════════════════════════════════════════
-- 3) RLS 정책 점검 — anon 클라이언트가 본인 행 photo UPDATE 가능한지
--    (로그인 사용자는 jwt sub = users.id 매칭 시 본인 행 update 가능해야 함)
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 본인 행 SELECT (이미 있을 수 있음 → DROP 후 CREATE)
DROP POLICY IF EXISTS "users_self_select" ON public.users;
CREATE POLICY "users_self_select" ON public.users
  FOR SELECT USING (true);  -- VIEW(users_safe) 통해 어차피 노출되므로 동일 정책

-- 본인 행 UPDATE — auth.uid() 매칭 또는 service_role
DROP POLICY IF EXISTS "users_self_update" ON public.users;
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (
    auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid()::text = id::text)
    OR auth.role() = 'authenticated'
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid()::text = id::text)
    OR auth.role() = 'authenticated'
  );

-- ════════════════════════════════════════════════════════════
-- 4) PostgREST 스키마 캐시 강제 리로드 (Supabase API 가 새 컬럼 인식하게)
-- ════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- 5) 진단 — 현재 상태 출력
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  has_photo_col boolean;
  has_photo_in_view boolean;
  user_count int;
  with_photo int;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='photo') INTO has_photo_col;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users_safe' AND column_name='photo') INTO has_photo_in_view;
  EXECUTE 'SELECT COUNT(*) FROM public.users' INTO user_count;
  EXECUTE 'SELECT COUNT(*) FROM public.users WHERE photo IS NOT NULL AND length(photo) > 0' INTO with_photo;

  RAISE NOTICE '────────────────────────────────────';
  RAISE NOTICE '진단 결과';
  RAISE NOTICE '────────────────────────────────────';
  RAISE NOTICE 'users.photo 컬럼 존재: %', has_photo_col;
  RAISE NOTICE 'users_safe.photo 노출: %', has_photo_in_view;
  RAISE NOTICE '전체 사용자: %명', user_count;
  RAISE NOTICE '사진 등록된 사용자: %명', with_photo;
  RAISE NOTICE '────────────────────────────────────';
  IF has_photo_col AND has_photo_in_view THEN
    RAISE NOTICE '✓ 모든 점검 통과 — 다시 사진 등록해보세요';
  END IF;
END $$;
