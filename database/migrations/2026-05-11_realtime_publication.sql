-- ════════════════════════════════════════════════════════════════════════════
--  W4: Supabase Realtime publication 보장
--  목적: users·videos·evaluations·notifications 의 변경 이벤트를 클라이언트가 구독 가능하게
--  실행: Supabase SQL Editor 에서 1회
-- ════════════════════════════════════════════════════════════════════════════

-- supabase_realtime publication 존재 확인 (Supabase 가 자동 생성하지만 안전판)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- 대상 테이블을 publication 에 추가 (이미 있으면 무시)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['users','videos','evaluations','notifications'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- 테이블 존재 확인
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      -- publication 에 이미 있는지
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END
$$;

-- 결과 확인
SELECT 'publication 등록 테이블' AS info;
SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename;
