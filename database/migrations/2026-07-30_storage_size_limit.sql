-- ════════════════════════════════════════════════════════════
-- 2026-07-30  Storage 업로드 용량 한도 해제
-- ════════════════════════════════════════════════════════════
-- 증상: 대형 교안(PPT 80MB · 209MB) 업로드 시
--       "파일 업로드 실패: The object exceeded the maximum allowed size"
--
-- 원인: Supabase Storage 의 'files' 버킷에 file_size_limit 가 걸려 있음.
--
-- 조치(코드): 8MB 초과 파일은 앱이 Supabase 대신 GCS(무제한)로 직접 올리도록 변경됨.
--             따라서 이 SQL 을 실행하지 않아도 대형 교안 업로드는 동작한다.
--             다만 8MB 이하 경로와 기타 첨부의 여유를 위해 한도를 넉넉히 올려둔다.
--
-- 실행: Supabase SQL Editor 에서 1회
-- ════════════════════════════════════════════════════════════

-- 1) 현재 한도 확인 (실행 전 상태 기록용)
SELECT id, name, public,
       file_size_limit,
       CASE WHEN file_size_limit IS NULL THEN '프로젝트 전역 설정 따름'
            ELSE (file_size_limit / 1024 / 1024)::text || ' MB' END AS 현재한도
FROM storage.buckets
ORDER BY id;

-- 2) 'files' 버킷 한도를 500MB 로 상향
UPDATE storage.buckets
SET file_size_limit = 500 * 1024 * 1024
WHERE id = 'files';

-- 3) 결과 확인 — 500 MB 로 바뀌었는지
SELECT id, (file_size_limit / 1024 / 1024) AS 한도_MB
FROM storage.buckets
WHERE id = 'files';

-- ════════════════════════════════════════════════════════════
-- ⚠ 주의 — SQL 만으로는 부족할 수 있음
-- ════════════════════════════════════════════════════════════
-- 버킷 한도와 별개로 '프로젝트 전역 업로드 한도' 가 있습니다.
-- 버킷 한도를 올려도 전역 한도보다 크면 전역 한도가 우선 적용됩니다.
--
-- 확인/변경 경로:
--   Supabase 대시보드 → Storage → Settings
--   → "Upload file size limit" 값을 500MB(또는 그 이상)으로 변경 후 저장
--
-- (무료 플랜은 50MB 고정, 유료 플랜에서 상향 가능)
--
-- 참고: user_photos 버킷은 프로필 사진 전용이라 3MB 한도를 유지합니다.
--       (2026-05-11_user_photos_storage.sql 참조)
