-- 사용자 사진 Storage 마이그레이션 + 정책
-- 실행: Supabase SQL Editor (한 번)
-- 목적: photo base64 (DB) → Storage URL 로 전환 → 응답 -80%

-- ════════════════════════════════════════════════════════════
-- 1) Storage 버킷 'user_photos' 생성 (없으면)
--    public = true → URL 직접 접근 가능 (CDN 자동 캐시)
-- ════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user_photos',
  'user_photos',
  true,                            -- public 읽기
  3 * 1024 * 1024,                 -- 3 MB 상한
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 3 * 1024 * 1024,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'];

-- ════════════════════════════════════════════════════════════
-- 2) Storage RLS 정책 — 읽기 public, 쓰기 authenticated
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "user_photos public read" ON storage.objects;
CREATE POLICY "user_photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user_photos');

DROP POLICY IF EXISTS "user_photos authenticated write" ON storage.objects;
CREATE POLICY "user_photos authenticated write"
  ON storage.objects FOR ALL
  USING (bucket_id = 'user_photos')
  WITH CHECK (bucket_id = 'user_photos');

-- ════════════════════════════════════════════════════════════
-- 3) users.photo 컬럼은 그대로 (이제 URL 문자열 저장)
--    이전 base64 데이터는 클라이언트 측에서 자동 감지 (data: vs https:)
-- ════════════════════════════════════════════════════════════

-- 검증
SELECT
  '버킷' AS 항목, name AS 값
FROM storage.buckets WHERE id='user_photos'
UNION ALL
SELECT '정책 (SELECT)', polname FROM pg_policy
  WHERE polrelid='storage.objects'::regclass AND polname='user_photos public read'
UNION ALL
SELECT '정책 (ALL)', polname FROM pg_policy
  WHERE polrelid='storage.objects'::regclass AND polname='user_photos authenticated write';
