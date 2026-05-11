-- ════════════════════════════════════════════════════════════════════════════
--  O5: 데이터 무결성 체크 (50명 동시 사용 안정성)
--  사용법: Supabase SQL Editor 에 붙여넣고 RUN — 일일 1회 또는 의심 상황 시
--  결과: 각 SECTION 의 마지막 SELECT 가 0건 이어야 정상
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) 중복 이메일 (대소문자 무시) — 로그인 충돌·email unique 우회 시도
-- ─────────────────────────────────────────────────────────────────
SELECT '1. 중복 이메일(lowercase)' AS check_name;
SELECT LOWER(email) AS lower_email, COUNT(*) AS cnt, ARRAY_AGG(id) AS user_ids
  FROM users
 WHERE email IS NOT NULL AND email <> ''
 GROUP BY LOWER(email)
HAVING COUNT(*) > 1;

-- ─────────────────────────────────────────────────────────────────
-- 2) 비밀번호가 bcrypt 가 아닌 강사 (평문 또는 손상)
--    정상: '$2a$' 또는 '$2b$' 시작 (bcrypt)
-- ─────────────────────────────────────────────────────────────────
SELECT '2. 평문 비밀번호 사용 강사' AS check_name;
SELECT id, name, email,
       CASE
         WHEN pw IS NULL OR pw = '' THEN '(빈값)'
         WHEN pw LIKE '$2a$%' OR pw LIKE '$2b$%' OR pw LIKE '$2y$%' THEN 'bcrypt(정상)'
         ELSE '평문(위험)'
       END AS pw_status
  FROM users
 WHERE pw IS NOT NULL AND pw <> ''
   AND NOT (pw LIKE '$2a$%' OR pw LIKE '$2b$%' OR pw LIKE '$2y$%');

-- ─────────────────────────────────────────────────────────────────
-- 3) photo 가 base64 인 강사 (Storage 마이그레이션 누락)
--    정상: http(s)://... 로 시작
-- ─────────────────────────────────────────────────────────────────
SELECT '3. base64 photo 잔존' AS check_name;
SELECT id, name, email, LENGTH(photo) AS photo_bytes,
       SUBSTRING(photo FOR 50) AS photo_preview
  FROM users
 WHERE photo IS NOT NULL
   AND photo NOT LIKE 'http%';

-- ─────────────────────────────────────────────────────────────────
-- 4) 고아 평가 (videos·voice_evaluations·checklists 가 없는 evaluations)
-- ─────────────────────────────────────────────────────────────────
SELECT '4. 고아 evaluations' AS check_name;
SELECT e.id, e.eval_type, e.video_id, e.voice_eval_id, e.checklist_id
  FROM evaluations e
  LEFT JOIN videos v ON v.id = e.video_id
  LEFT JOIN voice_evaluations vc ON vc.id = e.voice_eval_id
 WHERE (e.video_id IS NOT NULL AND v.id IS NULL)
    OR (e.voice_eval_id IS NOT NULL AND vc.id IS NULL);

-- ─────────────────────────────────────────────────────────────────
-- 5) 고아 video (소유자 user 가 삭제됐는데 영상이 살아있음)
-- ─────────────────────────────────────────────────────────────────
SELECT '5. 고아 videos (user 없음)' AS check_name;
SELECT v.id, v.title, v.user_id, v.created_at
  FROM videos v
  LEFT JOIN users u ON u.id = v.user_id
 WHERE v.user_id IS NOT NULL AND u.id IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 6) 동시 저장 충돌 흔적 — 같은 video_id·eval_type 으로 5분 안에 2건 이상
-- ─────────────────────────────────────────────────────────────────
SELECT '6. 평가 중복 저장 의심 (5분내)' AS check_name;
WITH paired AS (
  SELECT video_id, eval_type, COUNT(*) AS cnt,
         MAX(created_at) - MIN(created_at) AS dur
    FROM evaluations
   WHERE video_id IS NOT NULL
     AND created_at >= NOW() - INTERVAL '30 days'
   GROUP BY video_id, eval_type
  HAVING COUNT(*) >= 2
)
SELECT * FROM paired
 WHERE dur < INTERVAL '5 minutes';

-- ─────────────────────────────────────────────────────────────────
-- 7) 권한 정합성 — sub_admins 가 실제 강사 테이블에 존재하나?
-- ─────────────────────────────────────────────────────────────────
SELECT '7. sub_admins 의 user 존재 여부' AS check_name;
SELECT sa.user_id, sa.granted_at
  FROM sub_admins sa
  LEFT JOIN users u ON u.id = sa.user_id
 WHERE u.id IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 8) Storage 와 DB 의 photo URL 매핑 정합성
--    (수동 확인 — Storage 폴더 vs photo 컬럼)
-- ─────────────────────────────────────────────────────────────────
SELECT '8. photo URL 패턴 분포' AS check_name;
SELECT
  CASE
    WHEN photo IS NULL OR photo = '' THEN '(없음)'
    WHEN photo LIKE 'http%storage%' THEN 'Storage(정상)'
    WHEN photo LIKE 'data:image%' THEN 'base64(이전 필요)'
    WHEN photo LIKE 'http%' THEN '외부 URL'
    ELSE '기타'
  END AS pattern,
  COUNT(*) AS cnt
  FROM users
 GROUP BY pattern
 ORDER BY cnt DESC;

-- ─────────────────────────────────────────────────────────────────
-- 9) 활성 사용자·DB 크기·연결 수 (운영 모니터링)
-- ─────────────────────────────────────────────────────────────────
SELECT '9. 운영 지표' AS check_name;
SELECT
  (SELECT COUNT(*) FROM users WHERE deleted IS NOT TRUE)        AS active_users,
  (SELECT COUNT(*) FROM users WHERE deleted = TRUE)             AS deleted_users,
  (SELECT COUNT(*) FROM videos)                                  AS total_videos,
  (SELECT COUNT(*) FROM evaluations)                             AS total_evaluations,
  (SELECT COUNT(*) FROM evaluations WHERE created_at >= NOW() - INTERVAL '7 days') AS evaluations_last_7d,
  (SELECT pg_size_pretty(pg_database_size(current_database())))  AS db_size,
  (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') AS active_connections;
