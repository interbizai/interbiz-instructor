-- ════════════════════════════════════════════════════════════════════════════
--  notifications 테이블 RLS 비활성화
--  목적: notifyAdminsOfUpload / createNotification 시 "row-level security policy"
--        오류 차단 — 알림 INSERT 가 막히는 문제 해결
--  배경: 인터픽은 모든 core 테이블 RLS 비활성화 정책 (ERRORS.md #2, #7)
--        notifications 가 그 정책에서 누락되어 있었음
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- 권한 정합성 보장 (anon/authenticated 양쪽 INSERT/SELECT 가능)
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;

-- PostgREST 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

-- 확인
SELECT 'notifications RLS 상태 (false 면 정상)' AS info;
SELECT relrowsecurity AS rls_enabled
  FROM pg_class
 WHERE relname = 'notifications' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public');
